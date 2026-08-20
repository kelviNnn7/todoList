import SwiftUI
import WidgetKit

private let appGroup = "group.com.pindo.desktop"

struct SharedItem: Codable, Identifiable {
    let id: String
    let type: String
    let title: String
    let notes: String?
    let startAt: String?
    let dueAt: String?
    let completed: Bool

    var date: Date? {
        ISO8601DateFormatter().date(from: type == "meeting" ? (startAt ?? "") : (dueAt ?? ""))
    }
}

struct SharedSnapshot: Codable {
    let opacity: Double
    let items: [SharedItem]

    static let empty = SharedSnapshot(opacity: 95, items: [])
}

struct PindoEntry: TimelineEntry {
    let date: Date
    let opacity: Double
    let tasks: [SharedItem]
    let meeting: SharedItem?
}

struct PindoProvider: TimelineProvider {
    func placeholder(in context: Context) -> PindoEntry {
        PindoEntry(date: Date(), opacity: 95, tasks: [SharedItem(id: "sample", type: "task", title: "完成今日计划", notes: nil, startAt: nil, dueAt: nil, completed: false)], meeting: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (PindoEntry) -> Void) {
        completion(entry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PindoEntry>) -> Void) {
        let value = entry()
        completion(Timeline(entries: [value], policy: .after(Date().addingTimeInterval(60))))
    }

    private func entry() -> PindoEntry {
        let snapshot = loadSnapshot()
        let calendar = Calendar.current
        let active = snapshot.items.filter { !$0.completed }
        let tasks = active.filter { $0.type == "task" && ($0.date.map(calendar.isDateInToday) ?? false) }
            .sorted { ($0.date ?? .distantFuture) < ($1.date ?? .distantFuture) }
        let meeting = active.filter { $0.type == "meeting" && ($0.date.map(calendar.isDateInToday) ?? false) }
            .sorted { ($0.date ?? .distantFuture) < ($1.date ?? .distantFuture) }.first
        return PindoEntry(date: Date(), opacity: snapshot.opacity, tasks: tasks, meeting: meeting)
    }

    private func loadSnapshot() -> SharedSnapshot {
        guard let directory = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup),
              let data = try? Data(contentsOf: directory.appendingPathComponent("todo-widget.json")),
              let snapshot = try? JSONDecoder().decode(SharedSnapshot.self, from: data) else { return .empty }
        return snapshot
    }
}

struct PindoWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: PindoEntry

    private var content: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "checkmark.square.fill").foregroundStyle(.blue)
                Text("钉事 · 今天").font(.system(size: 13, weight: .semibold))
                Spacer()
                Text(entry.date, style: .date).font(.caption2).foregroundStyle(.secondary)
            }
            if let meeting = entry.meeting {
                HStack(spacing: 5) {
                    Image(systemName: "video.fill").foregroundStyle(.purple)
                    Text(meeting.title).lineLimit(1)
                    if let date = meeting.date { Spacer(); Text(date, style: .time).foregroundStyle(.secondary) }
                }.font(.caption)
            }
            if entry.tasks.isEmpty && entry.meeting == nil {
                Spacer()
                Text("今天没有待办").font(.caption).foregroundStyle(.secondary)
                Spacer()
            } else {
                ForEach(entry.tasks.prefix(family == .systemSmall ? 3 : 5)) { task in
                    HStack(spacing: 7) {
                        Image(systemName: "circle").font(.system(size: 11)).foregroundStyle(.secondary)
                        Text(task.title).font(.caption).lineLimit(1)
                        Spacer(minLength: 0)
                    }
                }
                Spacer(minLength: 0)
            }
        }
        .padding(14)
        .opacity(entry.opacity / 100)
        .widgetURL(URL(string: "pindo://today"))
    }

    @ViewBuilder var body: some View {
        if #available(macOSApplicationExtension 14.0, *) {
            content.containerBackground(for: .widget) { Color.clear }
        } else {
            content.background(Color.clear)
        }
    }
}

@main
struct PindoWidget: Widget {
    let kind = "PindoWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: PindoProvider()) { entry in PindoWidgetView(entry: entry) }
            .configurationDisplayName("钉事 · 今天")
            .description("查看今天的任务和最近会议。")
            .supportedFamilies([.systemSmall, .systemMedium])
    }
}
