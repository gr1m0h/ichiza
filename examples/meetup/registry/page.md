# {{.Title}}

## このイベントについて

（コミュニティの紹介・イベントの趣旨をここに。毎回同じ文面はテンプレに直書きでOK）

## 開催情報

- 日時: {{.DateJP}} 19:00〜21:00
{{- if and .Venue .Venue.Name}}
- 会場: {{.Venue.Name}}{{if .Venue.Capacity}}（定員 {{.Venue.Capacity}} 名）{{end}}
{{- end}}
{{- if and .Streaming .Streaming.Platform}}
- 配信: {{.Streaming.Platform}}{{if .Streaming.YouTubeURL}}（{{.Streaming.YouTubeURL}}）{{end}}
{{- end}}
{{- if .TimetableTable}}

## タイムテーブル

{{.TimetableTable}}
{{- end}}
{{- if .SpeakersSection}}

## 登壇者

{{.SpeakersSection}}
{{- end}}

## 参加にあたって

- ハッシュタグ: #yourmeetup
- 会場受付・入館方法は開催前のメッセージでご案内します
