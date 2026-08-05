# {{.Title}}

## 開催情報

- 日時: {{.DateJP}}
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

## 注意事項

- 参加枠・受付方法は connpass の設定を確認してください
