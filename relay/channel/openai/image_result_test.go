package openai

import "testing"

func TestExtractImageResultURLs(t *testing.T) {
	body := []byte(`{
		"created": 1710000000,
		"data": [
			{"url": "https://cdn.example.com/a.png"},
			{"b64_json": "abc"},
			{"url": "https://cdn.example.com/b.png"}
		]
	}`)

	urls := extractImageResultURLs(body)

	if len(urls) != 2 {
		t.Fatalf("expected 2 urls, got %d: %v", len(urls), urls)
	}
	if urls[0] != "https://cdn.example.com/a.png" || urls[1] != "https://cdn.example.com/b.png" {
		t.Fatalf("unexpected urls: %v", urls)
	}
}
