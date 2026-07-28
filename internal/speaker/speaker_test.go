package speaker

import (
	"strings"
	"testing"

	"github.com/gr1m0h/ichiza/internal/event"
)

// GitHub が Issue Form (starter/.github/ISSUE_TEMPLATE/speaker.yml) から
// 生成する markdown 本文の実形式。
const fullBody = `### お名前（ハンドルネーム可）

gr1m0h

### SNS の URL（X、GitHub など。任意）

https://x.com/gr1m0h

### 簡単な経歴・プロフィール（2〜3行程度）

SRE をやっています。
広島在住。

### セッションタイトル（仮で OK、後から変更可）

SLO はじめの一歩

### 登壇形態

- [x] リモート登壇を希望（配信用の参加リンクをお送りします）`

func TestParse(t *testing.T) {
	s := Parse(fullBody)
	want := event.Speaker{
		Handle:       "gr1m0h",
		SNS:          "https://x.com/gr1m0h",
		Bio:          "SRE をやっています。\n広島在住。",
		SessionTitle: "SLO はじめの一歩",
		Remote:       true,
	}
	if s != want {
		t.Errorf("Parse() = %+v, want %+v", s, want)
	}
}

func TestParseOptionalAndUnchecked(t *testing.T) {
	body := `### お名前（ハンドルネーム可）

hanako

### SNS の URL（X、GitHub など。任意）

_No response_

### 簡単な経歴・プロフィール（2〜3行程度）

インフラエンジニア。

### セッションタイトル（仮で OK、後から変更可）

LT ネタ未定

### 登壇形態

- [ ] リモート登壇を希望（配信用の参加リンクをお送りします）`
	s := Parse(body)
	if s.SNS != "" {
		t.Errorf(`SNS = %q, want "" for _No response_`, s.SNS)
	}
	if s.Remote {
		t.Error("Remote = true, want false for unchecked box")
	}
	if s.Handle != "hanako" || s.SessionTitle != "LT ネタ未定" {
		t.Errorf("Parse() = %+v", s)
	}
}

func TestParseEmptyBody(t *testing.T) {
	s := Parse("")
	if s != (event.Speaker{}) {
		t.Errorf("Parse(\"\") = %+v, want zero value", s)
	}
}

func TestConnpass(t *testing.T) {
	out := Connpass([]event.Speaker{
		{Handle: "gr1m0h", SNS: "https://x.com/gr1m0h", Bio: "SRE です。", SessionTitle: "SLO はじめの一歩", Remote: true},
		{Handle: "hanako", SessionTitle: ""},
	})
	for _, want := range []string{
		"## 登壇者",
		"### SLO はじめの一歩",
		"gr1m0h（リモート登壇）",
		"https://x.com/gr1m0h",
		"SRE です。",
		"### タイトル未定", // セッションタイトル空欄はプレースホルダ
		"hanako",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("Connpass() should contain %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, "hanako（リモート登壇）") {
		t.Errorf("hanako is not remote:\n%s", out)
	}
}
