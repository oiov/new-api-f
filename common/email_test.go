package common

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func withEmailGlobals(t *testing.T) {
	t.Helper()

	oldSenderType := EmailSenderType
	oldWorkerURL := CloudflareEmailWorkerURL
	oldWorkerToken := CloudflareEmailWorkerToken
	oldWorkerFromAddress := CloudflareEmailWorkerFromAddress
	oldWorkerFromName := CloudflareEmailWorkerFromName
	oldSMTPFrom := SMTPFrom
	oldSMTPAccount := SMTPAccount
	oldSMTPServer := SMTPServer
	oldSystemName := SystemName

	t.Cleanup(func() {
		EmailSenderType = oldSenderType
		CloudflareEmailWorkerURL = oldWorkerURL
		CloudflareEmailWorkerToken = oldWorkerToken
		CloudflareEmailWorkerFromAddress = oldWorkerFromAddress
		CloudflareEmailWorkerFromName = oldWorkerFromName
		SMTPFrom = oldSMTPFrom
		SMTPAccount = oldSMTPAccount
		SMTPServer = oldSMTPServer
		SystemName = oldSystemName
	})
}

func TestSendEmailUsesCloudflareWorkerPayload(t *testing.T) {
	withEmailGlobals(t)

	type addressPayload struct {
		Name    string `json:"name"`
		Address string `json:"address"`
	}
	type workerPayload struct {
		From    addressPayload `json:"from"`
		To      addressPayload `json:"to"`
		Subject string         `json:"subject"`
		Text    string         `json:"text"`
		HTML    string         `json:"html"`
	}

	var got workerPayload
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("expected POST, got %s", r.Method)
		}
		if r.URL.Path != "/send" {
			t.Fatalf("expected /send path, got %s", r.URL.Path)
		}
		if auth := r.Header.Get("Authorization"); auth != "Bearer worker-secret" {
			t.Fatalf("expected bearer token, got %q", auth)
		}
		if contentType := r.Header.Get("Content-Type"); !strings.HasPrefix(contentType, "application/json") {
			t.Fatalf("expected json content type, got %q", contentType)
		}
		if err := DecodeJson(r.Body, &got); err != nil {
			t.Fatalf("decode worker payload: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true}`))
	}))
	defer server.Close()

	EmailSenderType = EmailSenderTypeCloudflareWorker
	CloudflareEmailWorkerURL = server.URL + "/"
	CloudflareEmailWorkerToken = "worker-secret"
	CloudflareEmailWorkerFromAddress = "noreply@nbility.dev"
	CloudflareEmailWorkerFromName = "Nbility"
	SystemName = "FallbackName"

	err := SendEmail("欢迎注册", "user@example.com", "<p>Hello <strong>user</strong></p>")
	if err != nil {
		t.Fatalf("SendEmail returned error: %v", err)
	}

	if got.From.Address != "noreply@nbility.dev" {
		t.Fatalf("expected from address noreply@nbility.dev, got %q", got.From.Address)
	}
	if got.From.Name != "Nbility" {
		t.Fatalf("expected configured from name, got %q", got.From.Name)
	}
	if got.To.Address != "user@example.com" {
		t.Fatalf("expected receiver address, got %q", got.To.Address)
	}
	if got.Subject != "欢迎注册" {
		t.Fatalf("expected subject to be forwarded, got %q", got.Subject)
	}
	if got.HTML != "<p>Hello <strong>user</strong></p>" {
		t.Fatalf("expected html content to be forwarded, got %q", got.HTML)
	}
	if !strings.Contains(got.Text, "Hello user") || strings.Contains(got.Text, "<strong>") {
		t.Fatalf("expected plain text content stripped from html, got %q", got.Text)
	}
}

func TestSendEmailCloudflareWorkerDefaultsFromAddressAndName(t *testing.T) {
	withEmailGlobals(t)

	type workerPayload struct {
		From struct {
			Name    string `json:"name"`
			Address string `json:"address"`
		} `json:"from"`
	}

	var got workerPayload
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := DecodeJson(r.Body, &got); err != nil {
			t.Fatalf("decode worker payload: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true}`))
	}))
	defer server.Close()

	EmailSenderType = EmailSenderTypeCloudflareWorker
	CloudflareEmailWorkerURL = server.URL
	CloudflareEmailWorkerToken = "worker-secret"
	CloudflareEmailWorkerFromAddress = ""
	CloudflareEmailWorkerFromName = ""
	SystemName = "New API"

	if err := SendEmail("subject", "user@example.com", "<p>content</p>"); err != nil {
		t.Fatalf("SendEmail returned error: %v", err)
	}

	if got.From.Address != DefaultCloudflareEmailWorkerFromAddress {
		t.Fatalf("expected default from address %q, got %q", DefaultCloudflareEmailWorkerFromAddress, got.From.Address)
	}
	if got.From.Name != "New API" {
		t.Fatalf("expected SystemName fallback from name, got %q", got.From.Name)
	}
}

func TestSendEmailCloudflareWorkerReturnsAPIError(t *testing.T) {
	withEmailGlobals(t)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":"routing domain not enabled"}`))
	}))
	defer server.Close()

	EmailSenderType = EmailSenderTypeCloudflareWorker
	CloudflareEmailWorkerURL = server.URL
	CloudflareEmailWorkerToken = "worker-secret"

	err := SendEmail("subject", "user@example.com", "<p>content</p>")
	if err == nil {
		t.Fatal("expected worker error")
	}
	if !strings.Contains(err.Error(), "routing domain not enabled") {
		t.Fatalf("expected API error in message, got %v", err)
	}
}

func TestSendEmailCloudflareWorkerRequiresURLAndToken(t *testing.T) {
	withEmailGlobals(t)

	EmailSenderType = EmailSenderTypeCloudflareWorker
	CloudflareEmailWorkerURL = ""
	CloudflareEmailWorkerToken = "worker-secret"
	if err := SendEmail("subject", "user@example.com", "<p>content</p>"); err == nil || !strings.Contains(err.Error(), "Cloudflare Worker 邮件发送地址未配置") {
		t.Fatalf("expected missing worker url error, got %v", err)
	}

	CloudflareEmailWorkerURL = "https://example.com"
	CloudflareEmailWorkerToken = ""
	if err := SendEmail("subject", "user@example.com", "<p>content</p>"); err == nil || !strings.Contains(err.Error(), "Cloudflare Worker 邮件发送密钥未配置") {
		t.Fatalf("expected missing worker token error, got %v", err)
	}
}

func TestNormalizeCloudflareEmailWorkerSendURLAddsHTTPSAndSendPath(t *testing.T) {
	tests := []struct {
		name string
		raw  string
		want string
	}{
		{
			name: "bare host",
			raw:  "likedo-email-worker.yesmore.workers.dev",
			want: "https://likedo-email-worker.yesmore.workers.dev/send",
		},
		{
			name: "https url with trailing slash",
			raw:  "https://likedo-email-worker.yesmore.workers.dev/",
			want: "https://likedo-email-worker.yesmore.workers.dev/send",
		},
		{
			name: "local http url",
			raw:  "http://127.0.0.1:8787",
			want: "http://127.0.0.1:8787/send",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := normalizeCloudflareEmailWorkerSendURL(tt.raw); got != tt.want {
				t.Fatalf("expected %q, got %q", tt.want, got)
			}
		})
	}
}

func TestBuildPlainTextEmailContentKeepsReadableLinks(t *testing.T) {
	got := htmlToPlainTextEmail(`<p>点击 <a href="https://example.com/reset">此处</a> 重置。</p><p>验证码：<strong>123456</strong></p>`)
	wantParts := []string{
		"点击 此处 重置。",
		"验证码：123456",
	}
	for _, want := range wantParts {
		if !strings.Contains(got, want) {
			t.Fatalf("expected plain text to contain %q, got %q", want, got)
		}
	}
	if strings.Contains(fmt.Sprintf("%q", got), "<a") || strings.Contains(got, "<strong>") {
		t.Fatalf("expected html tags to be removed, got %q", got)
	}
}
