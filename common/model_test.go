package common

import "testing"

func TestIsImageGenerationModelIncludesGPTImage2(t *testing.T) {
	models := []string{
		"gpt-image-2",
		"gpt-image-2-vip",
	}

	for _, model := range models {
		if !IsImageGenerationModel(model) {
			t.Fatalf("expected %q to be treated as an image generation model", model)
		}
	}
}

func TestIsGPTImage2Model(t *testing.T) {
	if !IsGPTImage2Model(" gpt-image-2-vip ") {
		t.Fatal("expected gpt-image-2-vip to match gpt-image-2 helper")
	}
	if IsGPTImage2Model("gpt-image-1") {
		t.Fatal("expected gpt-image-1 not to match gpt-image-2 helper")
	}
}
