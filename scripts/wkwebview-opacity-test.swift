import AppKit
import Foundation
import WebKit
import Darwin

// Real WKWebView pixel regression for the widget shell background.
//
// The page is loaded twice with identical DOM/data but two strongly contrasting
// page backgrounds. At 100% the shell must fully hide the page background; at
// 55/75/95 the pixels must still change with that background. No click, focus,
// or timer is used to repair the shell: the snapshots are taken from a fresh
// WKWebView's first stable paint and after app-level blur/focus events.

struct PixelImage {
    let width: Int
    let height: Int
    let bytes: [UInt8]
}

struct ImageDiff: Codable {
    let mean: Double
    let maxChannel: Int
    let changedFraction: Double
}

struct RunResult {
    let label: String
    let keyWindow: Bool
    let images: [String: PixelImage]
    let metadata: [String: String]
    let points: [(name: String, x: Double, y: Double, radius: Int)]
    let beam: [String: String]
}

let backgroundA = "#000000"
let backgroundB = "#ffffff"

func pump(_ seconds: TimeInterval) {
    let deadline = Date().addingTimeInterval(seconds)
    while Date() < deadline {
        RunLoop.main.run(mode: .default, before: Date().addingTimeInterval(0.01))
    }
}

func imageFromSnapshot(_ image: NSImage) -> PixelImage? {
    guard let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        return nil
    }
    let width = cgImage.width
    let height = cgImage.height
    let bytesPerRow = width * 4
    var bytes = [UInt8](repeating: 0, count: bytesPerRow * height)
    // Keep the snapshot's own color space. Converting every frame through
    // DeviceRGB adds 1-2 level dithering noise on some macOS versions, which is
    // larger than the 100% opacity tolerance and unrelated to backdrop leakage.
    guard let context = CGContext(
        data: &bytes,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: bytesPerRow,
        space: cgImage.colorSpace ?? CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else {
        return nil
    }
    context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
    return PixelImage(width: width, height: height, bytes: bytes)
}

func diff(_ lhs: PixelImage, _ rhs: PixelImage) -> ImageDiff {
    guard lhs.width == rhs.width, lhs.height == rhs.height else {
        return ImageDiff(mean: .infinity, maxChannel: 255, changedFraction: 1)
    }
    let insetX = Int(Double(lhs.width) * 0.08)
    let insetY = Int(Double(lhs.height) * 0.08)
    let x0 = insetX
    let x1 = lhs.width - insetX
    let y0 = insetY
    let y1 = lhs.height - insetY
    var total = 0.0
    var maxChannel = 0
    var changed = 0
    var pixels = 0
    for y in y0..<y1 {
        for x in x0..<x1 {
            let offset = (y * lhs.width + x) * 4
            var pixelChanged = false
            for channel in 0..<3 {
                let delta = abs(Int(lhs.bytes[offset + channel]) - Int(rhs.bytes[offset + channel]))
                total += Double(delta)
                if delta > maxChannel { maxChannel = delta }
                if delta > 4 { pixelChanged = true }
            }
            if pixelChanged { changed += 1 }
            pixels += 1
        }
    }
    return ImageDiff(
        mean: total / Double(pixels * 3),
        maxChannel: maxChannel,
        changedFraction: Double(changed) / Double(pixels)
    )
}

let shellBackgroundPoints: [(Double, Double)] = [
    (0.0278, 0.25), (0.0278, 0.50), (0.0278, 0.75), (0.9722, 0.25), (0.9722, 0.75),
]
// Opaque topbar surface, used to measure the snapshot pipeline's global color
// bias between the two backdrop runs. It never takes the shell's opacity.
let calibrationPoints: [(Double, Double)] = [(0.50, 0.05)]

func backgroundDiff(_ lhs: PixelImage, _ rhs: PixelImage, points: [(Double, Double)] = shellBackgroundPoints) -> ImageDiff {
    guard lhs.width == rhs.width, lhs.height == rhs.height else {
        return ImageDiff(mean: .infinity, maxChannel: 255, changedFraction: 1)
    }
    // Fixed 5x5 patches in the 6pt shell padding strip between the resize
    // handles and the transparent workspace. Sampling outside those layers
    // isolates the shell material itself; the strip is too narrow for 7x7.
    var total = 0.0
    var maxChannel = 0
    var changed = 0
    var pixels = 0
    for (nx, ny) in points {
        let centerX = Int(Double(lhs.width) * nx)
        let centerY = Int(Double(lhs.height) * ny)
        for dy in -2...2 {
            for dx in -2...2 {
                let x = centerX + dx
                let y = centerY + dy
                guard x >= 0, y >= 0, x < lhs.width, y < lhs.height else { continue }
                let offset = (y * lhs.width + x) * 4
                var pixelChanged = false
                for channel in 0..<3 {
                    let delta = abs(Int(lhs.bytes[offset + channel]) - Int(rhs.bytes[offset + channel]))
                    total += Double(delta)
                    if delta > maxChannel { maxChannel = delta }
                    if delta > 4 { pixelChanged = true }
                }
                if pixelChanged { changed += 1 }
                pixels += 1
            }
        }
    }
    return ImageDiff(
        mean: total / Double(max(pixels, 1) * 3),
        maxChannel: maxChannel,
        changedFraction: Double(changed) / Double(max(pixels, 1))
    )
}


func patchDiff(_ lhs: PixelImage, _ rhs: PixelImage, x: Double, y: Double, radius: Int, scale: Double) -> ImageDiff {
    guard lhs.width == rhs.width, lhs.height == rhs.height else {
        return ImageDiff(mean: .infinity, maxChannel: 255, changedFraction: 1)
    }
    let centerX = Int((x * scale).rounded())
    let centerY = Int((y * scale).rounded())
    var total = 0.0
    var maxChannel = 0
    var changed = 0
    var pixels = 0
    for dy in -radius...radius {
        for dx in -radius...radius {
            let px = centerX + dx
            let py = centerY + dy
            guard px >= 0, py >= 0, px < lhs.width, py < lhs.height else { continue }
            let offset = (py * lhs.width + px) * 4
            var pixelChanged = false
            for channel in 0..<3 {
                let delta = abs(Int(lhs.bytes[offset + channel]) - Int(rhs.bytes[offset + channel]))
                total += Double(delta)
                if delta > maxChannel { maxChannel = delta }
                if delta > 4 { pixelChanged = true }
            }
            if pixelChanged { changed += 1 }
            pixels += 1
        }
    }
    return ImageDiff(
        mean: total / Double(max(pixels, 1) * 3),
        maxChannel: maxChannel,
        changedFraction: Double(changed) / Double(max(pixels, 1))
    )
}

func pngData(_ image: PixelImage) -> Data? {
    guard let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: image.width,
        pixelsHigh: image.height,
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: image.width * 4,
        bitsPerPixel: 32
    ) else { return nil }
    image.bytes.withUnsafeBufferPointer { buffer in
        if let destination = rep.bitmapData {
            destination.update(from: buffer.baseAddress!, count: image.bytes.count)
        }
    }
    return rep.representation(using: .png, properties: [:])
}

final class KeyWindow: NSWindow {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

final class Probe: NSObject, WKNavigationDelegate {
    let webView: WKWebView
    let window: NSWindow
    var didFinish = false
    var didFail = false
    var beamImages: [String: PixelImage] = [:]

    init(url: URL, background: String, opacity: Int, dark: Bool, label: String) {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()

        let controller = WKUserContentController()
        let backgroundCSS = "html, body { background: \(background) !important; background-image: none !important; min-height: 100% !important; } *, *::before, *::after { animation: none !important; transition: none !important; }"
        let backgroundScript = "var backgroundStyle = document.createElement('style'); backgroundStyle.textContent = '\(backgroundCSS)'; document.documentElement.appendChild(backgroundStyle);"
        controller.addUserScript(WKUserScript(
            source: backgroundScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        let seed = """
        (function () {
          try {
            localStorage.setItem("todo.appearanceOpacity", "\(opacity)");
            localStorage.setItem("todo.calendarView.widget", "week");
            localStorage.setItem("todo.calendarView.expanded", "week");
            var item = {
              id: "probe-item", type: "task", title: "像素探针事项", notes: "",
              startAt: null, endAt: null, dueAt: new Date().toISOString(),
              location: "", meetingUrl: "", reminderMinutes: null, reminderSentAt: null,
              reminderAt: null, reminderStatus: "none", snoozeCount: 0, lastReminderAt: null,
              completed: false, source: "local", subtasks: [], createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(), taskSchedule: null, completedDates: []
            };
            localStorage.setItem("todo.items.v1", JSON.stringify([item]));
          } catch (error) {}
        })();
        """
        controller.addUserScript(WKUserScript(
            source: seed,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        configuration.userContentController = controller

        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 360, height: 620), configuration: configuration)
        window = KeyWindow(
            contentRect: NSRect(x: 80, y: 80, width: 360, height: 620),
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )
        window.title = label
        window.isReleasedWhenClosed = false
        window.contentView = webView
        window.appearance = NSAppearance(named: dark ? .darkAqua : .aqua)
        window.backgroundColor = .clear
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        super.init()
        webView.navigationDelegate = self
        window.orderFrontRegardless()
        webView.load(URLRequest(url: url))
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        didFinish = true
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        print("navigation failed: \(error.localizedDescription)")
        didFail = true
    }

    func waitForFinish(timeout: TimeInterval = 15) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while !didFinish && !didFail && Date() < deadline {
            pump(0.02)
        }
        return didFinish
    }

    func eval(_ script: String) -> Any? {
        var result: Any?
        var finished = false
        webView.evaluateJavaScript(script) { value, error in
            if let error = error {
                print("javascript failed: \(error.localizedDescription)")
            }
            result = value
            finished = true
        }
        let deadline = Date().addingTimeInterval(5)
        while !finished && Date() < deadline {
            pump(0.01)
        }
        return result
    }

    func waitFor(_ script: String, timeout: TimeInterval = 10) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if let value = eval(script) as? Bool, value { return true }
            pump(0.02)
        }
        return false
    }

    func snapshot() -> PixelImage? {
        var image: NSImage?
        var finished = false
        let configuration = WKSnapshotConfiguration()
        configuration.rect = webView.bounds
        configuration.afterScreenUpdates = true
        webView.takeSnapshot(with: configuration) { value, error in
            if let error = error {
                print("snapshot failed: \(error.localizedDescription)")
            }
            image = value
            finished = true
        }
        let deadline = Date().addingTimeInterval(10)
        while !finished && Date() < deadline {
            pump(0.01)
        }
        guard let image = image else { return nil }
        return imageFromSnapshot(image)
    }


    func surfacePoints() -> [(name: String, x: Double, y: Double, radius: Int)] {
        let script = """
        (function () {
          function rect(element) {
            if (!element) return null;
            var r = element.getBoundingClientRect();
            return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
          }
          var shell = rect(document.querySelector("main.app-shell"));
          var topbar = rect(document.querySelector(".topbar"));
          var calendar = rect(document.querySelector(".calendar-panel"));
          var agenda = rect(document.querySelector(".agenda-header"));
          var group = rect(document.querySelector(".item-group")) || rect(document.querySelector(".empty-state"));
          if (!shell || !topbar || !calendar || !agenda || !group) return {};
          return {
            shell: { x: 7, y: shell.height / 2, r: 2 },
            topbar: { x: (topbar.left + topbar.right) / 2, y: (topbar.top + topbar.bottom) / 2, r: 2 },
            calendar: { x: calendar.right - 6, y: calendar.top + calendar.height / 2, r: 2 },
            agenda: { x: agenda.right - 8, y: agenda.top + 8, r: 2 },
            group: { x: group.right - 10, y: group.top + Math.min(36, Math.max(12, group.height - 10)), r: 2 },
            windowBorder: { x: shell.left + 0.5, y: shell.height / 2, r: 1 },
            panelBorder: { x: calendar.left + 0.5, y: calendar.top + calendar.height / 2, r: 1 }
          };
        })();
        """
        guard let value = eval(script) as? [String: [String: Double]] else { return [] }
        return value.compactMap { key, point in
            guard let x = point["x"], let y = point["y"], let radius = point["r"] else { return nil }
            return (key, x, y, Int(radius))
        }.sorted { $0.0 < $1.0 }
    }


    func beamState(_ script: String) -> [String: String] {
        guard let value = eval(script) as? [String: Any] else { return [:] }
        var result: [String: String] = [:]
        for (key, value) in value { result[key] = String(describing: value) }
        return result
    }

    func testBeam() -> [String: String] {
        // The opacity probe intentionally injects a snapshot-stability rule that
        // disables all animations. Remove only that injected style before the
        // motion-state checks; the production stylesheet is external.
        _ = eval("""
        (function () {
          [].slice.call(document.querySelectorAll("style")).forEach(function (style) {
            if ((style.textContent || "").indexOf("animation: none !important") >= 0) style.remove();
          });
          return true;
        })();
        """)
        _ = eval("""
        (function () {
          var target = [].slice.call(document.querySelectorAll(".day-cell")).find(function (cell) { return !cell.classList.contains("selected"); });
          if (!target) return false;
          window.__beamTarget = target;
          var event = new MouseEvent("pointerover", { bubbles: true, clientX: 1, clientY: 1 });
          Object.defineProperty(event, "pointerType", { value: "mouse" });
          Object.defineProperty(event, "buttons", { value: 0 });
          target.dispatchEvent(event);
          return true;
        })();
        """)
        let reduced = (eval("matchMedia('(prefers-reduced-motion: reduce)').matches") as? Bool) ?? false
        let control = beamState("""
        (function () {
          var style = document.createElement("style");
          style.textContent = "@keyframes wk-control { from { opacity: 0; } to { opacity: 1; } } #wk-control { animation-name: wk-control; animation-duration: 1s; animation-fill-mode: both; } #wk-svg-control { animation-name: wk-control; animation-duration: 1s; animation-fill-mode: both; }";
          document.head.appendChild(style);
          var div = document.createElement("div");
          div.id = "wk-control";
          document.body.appendChild(div);
          var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          svg.setAttribute("width", "10");
          svg.setAttribute("height", "10");
          var rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          rect.id = "wk-svg-control";
          rect.setAttribute("width", "10");
          rect.setAttribute("height", "10");
          svg.appendChild(rect);
          document.body.appendChild(svg);
          return {
            divAnimation: getComputedStyle(div).animationName,
            svgAnimation: getComputedStyle(rect).animationName,
            supportsAnimation: CSS.supports("animation-name", "wk-control"),
            supportsDash: CSS.supports("stroke-dashoffset", "0px"),
            traceAnimationRule: document.querySelectorAll(".day-cell.beam-active .day-beam-trace").length
          };
        })();
        """)
        _ = eval("""
        (function () {
          var target = window.__beamTarget;
          var trace = target && target.querySelector(".day-beam-trace");
          var animation = trace ? trace.getAnimations()[0] : null;
          if (!animation) return false;
          animation.pause();
          animation.currentTime = 450;
          window.__beamAnimation = animation;
          return true;
        })();
        """)
        pump(0.05)
        let mid = beamState("""
        (function () {
          var target = window.__beamTarget;
          var trace = target && target.querySelector(".day-beam-trace");
          var style = trace ? getComputedStyle(trace) : null;
          var animations = trace ? trace.getAnimations() : [];
          var animation = animations.length ? animations[0] : null;
          var timing = animation && animation.effect ? animation.effect.getTiming() : null;
          return {
            active: document.querySelectorAll(".beam-active").length,
            beams: document.querySelectorAll(".day-beam").length,
            matches: document.querySelectorAll(".day-cell.beam-active .day-beam-trace").length,
            currentTime: animation && animation.currentTime != null ? animation.currentTime : "",
            timingDuration: timing ? timing.duration : "",
            dash: style ? style.strokeDashoffset : "",
            animation: style ? style.animationName : "",
            duration: style ? style.animationDuration : "",
            opacity: style ? style.opacity : "",
            playState: animation ? animation.playState : ""
          };
        })();
        """)
        beamImages["beamMid"] = snapshot()
        _ = eval("""
        (function () {
          var animation = window.__beamAnimation;
          if (!animation) return false;
          animation.currentTime = 900;
          animation.finish();
          return true;
        })();
        """)
        pump(0.05)
        let end = beamState("""
        (function () {
          var target = window.__beamTarget;
          var trace = target && target.querySelector(".day-beam-trace");
          var style = trace ? getComputedStyle(trace) : null;
          var animations = trace ? trace.getAnimations() : [];
          return {
            active: document.querySelectorAll(".beam-active").length,
            dash: style ? style.strokeDashoffset : "",
            opacity: style ? style.opacity : "",
            playState: animations.length ? animations[0].playState : ""
          };
        })();
        """)
        beamImages["beamEnd"] = snapshot()
        _ = eval("""
        (function () {
          var target = window.__beamTarget;
          var out = new MouseEvent("pointerout", { bubbles: true });
          Object.defineProperty(out, "pointerType", { value: "mouse" });
          target.dispatchEvent(out);
          target.blur();
          target.focus();
          return true;
        })();
        """)
        pump(0.05)
        let keyboard = beamState("({ active: document.querySelectorAll('.beam-active').length })")
        _ = eval("""
        (function () {
          var target = window.__beamTarget;
          var over = new MouseEvent("pointerover", { bubbles: true });
          Object.defineProperty(over, "pointerType", { value: "mouse" });
          target.dispatchEvent(over);
          window.dispatchEvent(new Event("scroll"));
          return true;
        })();
        """)
        pump(0.05)
        let scrolled = beamState("({ active: document.querySelectorAll('.beam-active').length })")
        _ = eval("""
        (function () {
          var target = window.__beamTarget;
          var over = new MouseEvent("pointerover", { bubbles: true });
          Object.defineProperty(over, "pointerType", { value: "mouse" });
          target.dispatchEvent(over);
          document.querySelectorAll(".view-switch button")[1].click();
          return true;
        })();
        """)
        pump(0.08)
        let switched = beamState("({ active: document.querySelectorAll('.beam-active').length })")
        _ = eval("""
        (function () {
          var target = [].slice.call(document.querySelectorAll(".day-cell")).find(function (cell) { return !cell.classList.contains("selected"); }) || document.querySelector(".day-cell");
          var over = new MouseEvent("pointerover", { bubbles: true });
          Object.defineProperty(over, "pointerType", { value: "touch" });
          target.dispatchEvent(over);
          return true;
        })();
        """)
        pump(0.05)
        let touch = beamState("({ active: document.querySelectorAll('.beam-active').length })")
        var forcedMid: [String: String] = [:]
        var forcedEnd: [String: String] = [:]
        if reduced {
            _ = eval("""
            (function () {
              var style = document.createElement("style");
              style.id = "beam-force-animation";
              style.textContent = ".day-cell.beam-active .day-beam-trace { animation-name: calendar-beam-trace !important; animation-duration: 900ms !important; animation-timing-function: linear !important; animation-fill-mode: both !important; animation-iteration-count: 1 !important; }";
              document.documentElement.appendChild(style);
              var target = [].slice.call(document.querySelectorAll(".day-cell")).find(function (cell) { return !cell.classList.contains("selected"); });
              var over = new MouseEvent("pointerover", { bubbles: true });
              Object.defineProperty(over, "pointerType", { value: "mouse" });
              target.dispatchEvent(over);
              return true;
            })();
            """)
            _ = eval("""
            (function () {
              var target = document.querySelector(".beam-active");
              var trace = target && target.querySelector(".day-beam-trace");
              var animation = trace ? trace.getAnimations()[0] : null;
              if (!animation) return false;
              animation.pause();
              animation.currentTime = 450;
              window.__beamForcedAnimation = animation;
              return true;
            })();
            """)
            pump(0.05)
            forcedMid = beamState("""
            (function () {
              var target = document.querySelector(".beam-active");
              var trace = target && target.querySelector(".day-beam-trace");
              var style = trace ? getComputedStyle(trace) : null;
              var animations = trace ? trace.getAnimations() : [];
              var animation = animations.length ? animations[0] : null;
              var timing = animation && animation.effect ? animation.effect.getTiming() : null;
              return {
                active: document.querySelectorAll(".beam-active").length,
                dash: style ? style.strokeDashoffset : "",
                animation: style ? style.animationName : "",
                duration: style ? style.animationDuration : "",
                timingDuration: timing ? timing.duration : "",
                playState: animation ? animation.playState : ""
              };
            })();
            """)
            _ = eval("""
            (function () {
              var animation = window.__beamForcedAnimation;
              if (!animation) return false;
              animation.currentTime = 900;
              animation.finish();
              return true;
            })();
            """)
            pump(0.05)
            forcedEnd = beamState("""
            (function () {
              var target = document.querySelector(".beam-active");
              var trace = target && target.querySelector(".day-beam-trace");
              var style = trace ? getComputedStyle(trace) : null;
              var animations = trace ? trace.getAnimations() : [];
              return {
                active: document.querySelectorAll(".beam-active").length,
                dash: style ? style.strokeDashoffset : "",
                playState: animations.length ? animations[0].playState : ""
              };
            })();
            """)
            _ = eval("""
            (function () {
              var target = document.querySelector(".beam-active");
              var out = new MouseEvent("pointerout", { bubbles: true });
              Object.defineProperty(out, "pointerType", { value: "mouse" });
              if (target) target.dispatchEvent(out);
              var style = document.getElementById("beam-force-animation");
              if (style) style.remove();
              return true;
            })();
            """)
            pump(0.05)
        }
        _ = eval("""
        (function () {
          var style = document.createElement("style");
          style.id = "beam-static-fallback";
          style.textContent = "*, *::before, *::after { animation: none !important; transition: none !important; }";
          document.documentElement.appendChild(style);
          var target = [].slice.call(document.querySelectorAll(".day-cell")).find(function (cell) { return !cell.classList.contains("selected"); }) || document.querySelector(".day-cell");
          var over = new MouseEvent("pointerover", { bubbles: true });
          Object.defineProperty(over, "pointerType", { value: "mouse" });
          target.dispatchEvent(over);
          return true;
        })();
        """)
        pump(0.05)
        let fallback = beamState("""
        (function () {
          var target = document.querySelector(".beam-active");
          var trace = target && target.querySelector(".day-beam-trace");
          var ring = target && target.querySelector(".day-beam-static");
          return {
            active: document.querySelectorAll(".beam-active").length,
            traceOpacity: trace ? getComputedStyle(trace).opacity : "",
            ringStroke: ring ? getComputedStyle(ring).stroke : ""
          };
        })();
        """)
        var report: [String: String] = [:]
        report["reduced"] = String(reduced)
        for (key, value) in control { report["control." + key] = value }
        for (key, value) in mid { report["mid." + key] = value }
        for (key, value) in end { report["end." + key] = value }
        for (key, value) in keyboard { report["keyboard." + key] = value }
        for (key, value) in scrolled { report["scrolled." + key] = value }
        for (key, value) in switched { report["switched." + key] = value }
        for (key, value) in touch { report["touch." + key] = value }
        for (key, value) in forcedMid { report["forcedMid." + key] = value }
        for (key, value) in forcedEnd { report["forcedEnd." + key] = value }
        for (key, value) in fallback { report["fallback." + key] = value }
        return report
    }

    func metadata() -> [String: String] {
        let script = """
        (function () {
          var shell = document.querySelector("main.app-shell");
          if (!shell) return {};
          var style = getComputedStyle(shell);
          var before = getComputedStyle(shell, "::before");
          var heading = document.querySelector(".agenda-heading h2") || document.querySelector("h1");
          return {
            inlineOpacity: shell.style.getPropertyValue("--widget-opacity"),
            documentOpacity: document.documentElement.style.getPropertyValue("--widget-opacity"),
            shellBackgroundColor: style.backgroundColor,
            shellOpacity: style.opacity,
            shellBackdropFilter: style.backdropFilter || style.webkitBackdropFilter || "none",
            shellBeforeContent: before.content,
            textColor: heading ? getComputedStyle(heading).color : "",
            textOpacity: heading ? getComputedStyle(heading).opacity : "",
            keyWindow: String(false)
          };
        })();
        """
        guard let value = eval(script) as? [String: Any] else { return [:] }
        var result: [String: String] = [:]
        for (key, value) in value {
            result[key] = String(describing: value)
        }
        return result
    }

    func activate() -> Bool {
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        _ = NSRunningApplication.current.activate(options: [.activateAllWindows, .activateIgnoringOtherApps])
        pump(0.8)
        return window.isKeyWindow
    }

    func close() {
        window.orderOut(nil)
        window.contentView = nil
    }
}

func runProbe(url: URL, opacity: Int, dark: Bool, background: String, label: String, activate: Bool) -> RunResult? {
    let probe = Probe(url: url, background: background, opacity: opacity, dark: dark, label: label)
    guard probe.waitForFinish() else { return nil }
    guard probe.waitFor("!!document.querySelector('main.app-shell')") else {
        print("app shell did not render for \(label)")
        return nil
    }
    // Wait until the shell material itself is applied. This still happens before
    // any interaction and avoids comparing a pre-CSS flash with the first frame.
    guard probe.waitFor("(function () { var shell = document.querySelector('main.app-shell'); return document.readyState === 'complete' && !!shell && (shell.classList.contains('opaque') || getComputedStyle(shell).backgroundImage.indexOf('linear-gradient') >= 0); })()") else {
        print("app shell material did not apply for \(label)")
        return nil
    }
    // This is the first stable shell frame with no click, focus, or timer intervention.
    pump(0.05)
    guard let firstPaint = probe.snapshot() else { return nil }
    _ = probe.waitFor("!!document.querySelector('.empty-state')")
    pump(0.05)
    guard let ready = probe.snapshot() else { return nil }

    _ = probe.eval("window.dispatchEvent(new Event('blur'))")
    pump(0.08)
    guard let blurred = probe.snapshot() else { return nil }

    _ = probe.eval("window.dispatchEvent(new Event('focus'))")
    pump(0.08)
    guard let focused = probe.snapshot() else { return nil }

    _ = probe.eval("document.querySelector('main.app-shell').classList.add('dragging')")
    pump(0.08)
    guard let dragging = probe.snapshot() else { return nil }
    _ = probe.eval("document.querySelector('main.app-shell').classList.remove('dragging')")

    probe.window.orderOut(nil)
    pump(0.15)
    probe.window.orderFrontRegardless()
    pump(0.15)
    guard let restored = probe.snapshot() else { return nil }

    var keyWindow = false
    var active: PixelImage?
    if activate {
        keyWindow = probe.activate()
        active = probe.snapshot()
    }

    var metadata = probe.metadata()
    metadata["keyWindow"] = String(keyWindow)
    let points = probe.surfacePoints()
    var images: [String: PixelImage] = [
        "firstPaint": firstPaint,
        "ready": ready,
        "blur": blurred,
        "focus": focused,
        "dragging": dragging,
        "restored": restored,
    ]
    if let active = active { images["active"] = active }
    var beam: [String: String] = [:]
    if opacity == 60 && !dark {
        beam = probe.testBeam()
        for (key, image) in probe.beamImages { images[key] = image }
    }
    probe.close()
    return RunResult(label: label, keyWindow: keyWindow, images: images, metadata: metadata, points: points, beam: beam)
}

func writeJSON(_ value: Any, to url: URL) {
    guard JSONSerialization.isValidJSONObject(value),
          let data = try? JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys]) else {
        return
    }
    try? data.write(to: url)
}

func runTests(url: URL, outputDirectory: URL) {
    let onlyBeam = ProcessInfo.processInfo.environment["WKWEBVIEW_BEAM_ONLY"] == "1"
    let allCases: [(name: String, opacity: Int, dark: Bool, activate: Bool)] = [
        ("light-100", 100, false, true),
        ("light-95", 95, false, false),
        ("light-75", 75, false, false),
        ("light-60", 60, false, false),
        ("light-55", 55, false, false),
        ("dark-100", 100, true, true),
        ("dark-60", 60, true, false),
    ]
    let cases = onlyBeam ? [("light-60", 60, false, false)] : allCases
    let states = ["firstPaint", "ready", "blur", "focus", "dragging", "restored", "active"]
    var report: [[String: Any]] = []
    var failures: [String] = []

    for item in cases {
        let aLabel = "\(item.name)-background-a"
        let bLabel = "\(item.name)-background-b"
        guard let runA = runProbe(url: url, opacity: item.opacity, dark: item.dark, background: backgroundA, label: aLabel, activate: item.activate),
              let runB = runProbe(url: url, opacity: item.opacity, dark: item.dark, background: backgroundB, label: bLabel, activate: item.activate) else {
            failures.append("\(item.name): WebKit probe did not complete")
            continue
        }

        var caseReport: [String: Any] = [
            "name": item.name,
            "opacity": item.opacity,
            "scheme": item.dark ? "dark" : "light",
            "keyWindowA": runA.keyWindow,
            "keyWindowB": runB.keyWindow,
            "metadataA": runA.metadata,
            "metadataB": runB.metadata,
        ]
        var diffs: [String: Any] = [:]
        var backgroundDiffs: [String: Any] = [:]
        var stability: [String: Any] = [:]
        for state in states {
            guard let imageA = runA.images[state], let imageB = runB.images[state] else { continue }
            let region = diff(imageA, imageB)
            diffs[state] = [
                "mean": region.mean,
                "maxChannel": region.maxChannel,
                "changedFraction": region.changedFraction,
            ]
            let background = backgroundDiff(imageA, imageB)
            backgroundDiffs[state] = [
                "mean": background.mean,
                "maxChannel": background.maxChannel,
                "changedFraction": background.changedFraction,
            ]
        }
        for state in ["blur", "focus", "dragging", "restored", "active"] {
            guard let readyA = runA.images["ready"], let imageA = runA.images[state] else { continue }
            let value = diff(readyA, imageA)
            stability["ready-\(state)"] = ["mean": value.mean, "maxChannel": value.maxChannel, "changedFraction": value.changedFraction]
        }
        var surfaceReport: [[String: Any]] = []
        let scale = Double(runA.images["ready"]!.width) / 360.0
        for point in runA.points {
            guard let imageA = runA.images["ready"], let imageB = runB.images["ready"] else { continue }
            let value = patchDiff(imageA, imageB, x: point.x, y: point.y, radius: point.radius, scale: scale)
            surfaceReport.append([
                "name": point.name,
                "x": point.x,
                "y": point.y,
                "radius": point.radius,
                "mean": value.mean,
                "maxChannel": value.maxChannel,
                "changedFraction": value.changedFraction,
            ])
            let expected = 255.0 * (1.0 - Double(item.opacity) / 100.0)
            if point.name != "panelBorder" {
                if item.opacity == 100 {
                    if value.mean > 0.5 || value.maxChannel > 2 {
                        failures.append("\(item.name)-\(point.name): 100% surface leaked mean=\(value.mean) max=\(value.maxChannel)")
                    }
                } else if abs(value.mean - expected) > 7.65 {
                    failures.append("\(item.name)-\(point.name): expected alpha diff \(expected) ±7.65, got \(value.mean) max=\(value.maxChannel)")
                }
            }
        }
        caseReport["surfaceAlpha"] = surfaceReport
        if !runA.beam.isEmpty {
            caseReport["beam"] = runA.beam
            let beam = runA.beam
            if beam["mid.active"] != "1" || beam["mid.beams"] != "1" {
                failures.append("\(item.name)-beam: expected exactly one active cell/beam, got active=\(beam["mid.active"] ?? "nil") beams=\(beam["mid.beams"] ?? "nil")")
            }
            if beam["reduced"] == "true" {
                if beam["mid.animation"] != "none" || beam["mid.dash"] != "0px" {
                    failures.append("\(item.name)-beam: reduced-motion static fallback missing: animation=\(beam["mid.animation"] ?? "nil") dash=\(beam["mid.dash"] ?? "nil")")
                }
                if beam["forcedMid.active"] != "1" || beam["forcedMid.animation"] != "calendar-beam-trace" || beam["forcedMid.duration"] != "0.9s" || beam["forcedMid.timingDuration"] != "900" || beam["forcedMid.playState"] != "paused" {
                    failures.append("\(item.name)-beam: forced animation did not run in WKWebView: \(beam["forcedMid.animation"] ?? "nil") / \(beam["forcedMid.duration"] ?? "nil") / \(beam["forcedMid.playState"] ?? "nil")")
                }
                if beam["forcedEnd.active"] != "1" || beam["forcedEnd.dash"] != "0px" || beam["forcedEnd.playState"] != "finished" {
                    failures.append("\(item.name)-beam: forced 900ms turn did not settle: active=\(beam["forcedEnd.active"] ?? "nil") dash=\(beam["forcedEnd.dash"] ?? "nil") state=\(beam["forcedEnd.playState"] ?? "nil")")
                }
            } else {
                if beam["mid.animation"] != "calendar-beam-trace" || beam["mid.duration"] != "0.9s" {
                    failures.append("\(item.name)-beam: animation not configured: \(beam["mid.animation"] ?? "nil") / \(beam["mid.duration"] ?? "nil")")
                }
                if beam["mid.dash"] == "0px" || beam["mid.dash"] == "100px" || beam["mid.playState"] != "paused" || beam["mid.timingDuration"] != "900" {
                    failures.append("\(item.name)-beam: trace did not reach the 450ms midpoint: dash=\(beam["mid.dash"] ?? "nil") state=\(beam["mid.playState"] ?? "nil") duration=\(beam["mid.timingDuration"] ?? "nil")")
                }
                if beam["end.active"] != "1" || beam["end.dash"] != "0px" || beam["end.playState"] != "finished" {
                    failures.append("\(item.name)-beam: 900ms single turn did not settle: active=\(beam["end.active"] ?? "nil") dash=\(beam["end.dash"] ?? "nil") state=\(beam["end.playState"] ?? "nil")")
                }
            }
            for key in ["keyboard", "scrolled", "switched", "touch"] {
                if beam["\(key).active"] != "0" {
                    failures.append("\(item.name)-beam: \(key) did not clear the beam: \(beam["\(key).active"] ?? "nil")")
                }
            }
            if beam["fallback.active"] != "1" || !["0", ".62"].contains(beam["fallback.traceOpacity"] ?? "") || beam["fallback.ringStroke"] == "none" {
                failures.append("\(item.name)-beam: static fallback missing: active=\(beam["fallback.active"] ?? "nil") trace=\(beam["fallback.traceOpacity"] ?? "nil") ring=\(beam["fallback.ringStroke"] ?? "nil")")
            }
        }
        caseReport["backgroundDiff"] = diffs
        caseReport["backgroundPixelDiff"] = backgroundDiffs
        let calibration = backgroundDiff(runA.images["ready"]!, runB.images["ready"]!, points: calibrationPoints)
        caseReport["backgroundCalibration"] = [
            "mean": calibration.mean,
            "maxChannel": calibration.maxChannel,
            "changedFraction": calibration.changedFraction,
        ]
        caseReport["stability"] = stability
        report.append(caseReport)

        // Persist representative pixels for human review.
        for state in ["firstPaint", "ready", "blur", "focus", "dragging", "restored", "active", "beamMid", "beamEnd"] {
            if let image = runA.images[state], let data = pngData(image) {
                try? data.write(to: outputDirectory.appendingPathComponent("\(item.name)-\(state)-a.png"))
            }
            if let image = runB.images[state], let data = pngData(image) {
                try? data.write(to: outputDirectory.appendingPathComponent("\(item.name)-\(state)-b.png"))
            }
        }

        let aDiff = backgroundDiff(runA.images["ready"]!, runB.images["ready"]!)
        let firstDiff = backgroundDiff(runA.images["firstPaint"]!, runB.images["firstPaint"]!)
        let blurDiff = backgroundDiff(runA.images["blur"]!, runB.images["blur"]!)
        let focusDiff = backgroundDiff(runA.images["focus"]!, runB.images["focus"]!)
        let dragDiff = backgroundDiff(runA.images["dragging"]!, runB.images["dragging"]!)
        let restoredDiff = backgroundDiff(runA.images["restored"]!, runB.images["restored"]!)
        let regionReady = diff(runA.images["ready"]!, runB.images["ready"]!)
        switch item.opacity {
        case 100:
            for (state, value) in [("firstPaint", firstDiff), ("ready", aDiff), ("blur", blurDiff), ("focus", focusDiff), ("dragging", dragDiff), ("restored", restoredDiff)] {
                let calibrated = max(0, value.mean - calibration.mean)
                if calibrated > 0.2 || value.maxChannel > 2 {
                    failures.append("\(item.name)-\(state): background pixels leaked mean=\(value.mean) calibrated=\(calibrated) baseline=\(calibration.mean) max=\(value.maxChannel)")
                }
            }
            // Content is settled after the first paint; allow only tiny antialiasing
            // noise while still rejecting a real desktop-background leak.
            if regionReady.mean > 1.0 || regionReady.maxChannel > 8 || regionReady.changedFraction > 0.02 {
                failures.append("\(item.name)-ready: content region leaked mean=\(regionReady.mean) max=\(regionReady.maxChannel) changed=\(regionReady.changedFraction)")
            }
            if item.activate {
                if runA.keyWindow && runB.keyWindow, let activeA = runA.images["active"], let activeB = runB.images["active"] {
                    let activeDiff = diff(activeA, activeB)
                    if activeDiff.mean > 0.5 || activeDiff.maxChannel > 2 {
                        failures.append("\(item.name)-active: background leaked mean=\(activeDiff.mean) max=\(activeDiff.maxChannel)")
                    }
                } else if requireActivation {
                    failures.append("\(item.name): activation probe did not produce a key window")
                }
            }
        case 95:
            if aDiff.mean < 1.0 { failures.append("\(item.name): 95% was unexpectedly opaque mean=\(aDiff.mean)") }
        case 75:
            if aDiff.mean < 2.0 { failures.append("\(item.name): 75% was unexpectedly opaque mean=\(aDiff.mean)") }
        case 55:
            if aDiff.mean < 5.0 { failures.append("\(item.name): 55% was unexpectedly opaque mean=\(aDiff.mean)") }
        default:
            break
        }
        for (state, value) in stability {
            guard let dict = value as? [String: Any], let mean = dict["mean"] as? Double else { continue }
            if mean > 0.5 {
                failures.append("\(item.name): \(state) visual state was not stable mean=\(mean)")
            }
        }
        if let textOpacity = runA.metadata["textOpacity"], textOpacity != "1" {
            failures.append("\(item.name): heading opacity changed to \(textOpacity)")
        }
        if let backdrop = runA.metadata["shellBackdropFilter"], backdrop != "none" {
            failures.append("\(item.name): shell still has backdrop-filter \(backdrop)")
        }
        if let before = runA.metadata["shellBeforeContent"], before != "none" {
            failures.append("\(item.name): shell still has a ::before layer \(before)")
        }
    }

    let summary: [String: Any] = [
        "generatedAt": ISO8601DateFormatter().string(from: Date()),
        "engine": "WKWebView",
        "os": ProcessInfo.processInfo.operatingSystemVersionString,
        "backgroundA": backgroundA,
        "backgroundB": backgroundB,
        "cases": report,
        "failures": failures,
        "passed": failures.isEmpty,
    ]
    writeJSON(summary, to: outputDirectory.appendingPathComponent("wkwebview-opacity.json"))
    if let data = try? JSONSerialization.data(withJSONObject: summary, options: [.prettyPrinted, .sortedKeys]),
       let text = String(data: data, encoding: .utf8) {
        print(text)
    }
    fflush(stdout)
    _exit(failures.isEmpty ? 0 : 1)
}

let arguments = CommandLine.arguments
let environment = ProcessInfo.processInfo.environment
let urlString = environment["WKWEBVIEW_URL"] ?? (arguments.count >= 3 ? arguments[1] : nil)
let outputPath = environment["WKWEBVIEW_OUT"] ?? (arguments.count >= 3 ? arguments[2] : nil)
guard let urlString = urlString, let url = URL(string: urlString), let outputPath = outputPath else {
    print("usage: wkwebview-opacity-test <url> <output-directory> (or WKWEBVIEW_URL / WKWEBVIEW_OUT)")
    exit(2)
}
let requireActivation = environment["WKWEBVIEW_REQUIRE_ACTIVATION"] == "1"
let outputDirectory = URL(fileURLWithPath: outputPath, isDirectory: true)
try? FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)

let app = NSApplication.shared
app.setActivationPolicy(.regular)
app.finishLaunching()
runTests(url: url, outputDirectory: outputDirectory)
