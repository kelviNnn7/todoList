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
}

let backgroundA = "#080d12"
let backgroundB = "#f7fafc"

func pump(_ seconds: TimeInterval) {
    let deadline = Date().addingTimeInterval(seconds)
    while Date() < deadline {
        RunLoop.main.run(mode: .default, before: Date().addingTimeInterval(0.01))
    }
}

func imageFromSnapshot(_ image: NSImage) -> PixelImage? {
    guard let tiff = image.tiffRepresentation,
          let rep = NSBitmapImageRep(data: tiff),
          let cgImage = rep.cgImage else {
        return nil
    }
    let width = rep.pixelsWide
    let height = rep.pixelsHigh
    let bytesPerRow = width * 4
    var bytes = [UInt8](repeating: 0, count: bytesPerRow * height)
    guard let context = CGContext(
        data: &bytes,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: bytesPerRow,
        space: CGColorSpaceCreateDeviceRGB(),
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

func backgroundDiff(_ lhs: PixelImage, _ rhs: PixelImage) -> ImageDiff {
    guard lhs.width == rhs.width, lhs.height == rhs.height else {
        return ImageDiff(mean: .infinity, maxChannel: 255, changedFraction: 1)
    }
    // Fixed patches in the shell padding/empty bottom area. These never contain
    // text or controls, so the comparison isolates the shell background even
    // when the loading -> empty-state content timing differs between runs.
    let points: [(Double, Double)] = [
        (0.08, 0.80), (0.92, 0.80), (0.08, 0.92), (0.92, 0.92), (0.50, 0.95),
    ]
    var total = 0.0
    var maxChannel = 0
    var changed = 0
    var pixels = 0
    for (nx, ny) in points {
        let centerX = Int(Double(lhs.width) * nx)
        let centerY = Int(Double(lhs.height) * ny)
        for dy in -3...3 {
            for dx in -3...3 {
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
            localStorage.setItem("todo.items.v1", "[]");
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
    guard probe.waitFor("(function () { var shell = document.querySelector('main.app-shell'); return document.readyState === 'complete' && !!shell && getComputedStyle(shell).backgroundImage.indexOf('linear-gradient') >= 0; })()") else {
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
    var images: [String: PixelImage] = [
        "firstPaint": firstPaint,
        "ready": ready,
        "blur": blurred,
        "focus": focused,
        "dragging": dragging,
        "restored": restored,
    ]
    if let active = active { images["active"] = active }
    probe.close()
    return RunResult(label: label, keyWindow: keyWindow, images: images, metadata: metadata)
}

func writeJSON(_ value: Any, to url: URL) {
    guard JSONSerialization.isValidJSONObject(value),
          let data = try? JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys]) else {
        return
    }
    try? data.write(to: url)
}

func runTests(url: URL, outputDirectory: URL) {
    let cases: [(name: String, opacity: Int, dark: Bool, activate: Bool)] = [
        ("light-100", 100, false, true),
        ("light-95", 95, false, false),
        ("light-75", 75, false, false),
        ("light-55", 55, false, false),
        ("dark-100", 100, true, true),
        ("dark-55", 55, true, false),
    ]
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
        caseReport["backgroundDiff"] = diffs
        caseReport["backgroundPixelDiff"] = backgroundDiffs
        caseReport["stability"] = stability
        report.append(caseReport)

        // Persist representative pixels for human review.
        for state in ["firstPaint", "ready", "blur", "focus", "dragging", "restored", "active"] {
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
                if value.mean > 0.2 || value.maxChannel > 2 {
                    failures.append("\(item.name)-\(state): background pixels leaked mean=\(value.mean) max=\(value.maxChannel)")
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
