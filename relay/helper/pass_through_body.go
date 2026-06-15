package helper

import (
	"bytes"
	"io"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/tidwall/sjson"

	"github.com/gin-gonic/gin"
)

// BuildPassThroughRequestBody preserves the original request body while forcing the
// final upstream model into JSON payloads after model_mapping has been resolved.
func BuildPassThroughRequestBody(c *gin.Context, info *relaycommon.RelayInfo) (io.Reader, error) {
	storage, err := common.GetBodyStorage(c)
	if err != nil {
		return nil, err
	}

	if c == nil || c.Request == nil || !strings.HasPrefix(c.Request.Header.Get("Content-Type"), "application/json") {
		return common.ReaderOnly(storage), nil
	}

	if !shouldRewritePassThroughModel(info) {
		return common.ReaderOnly(storage), nil
	}

	upstreamModelName := strings.TrimSpace(info.UpstreamModelName)
	if upstreamModelName == "" {
		return common.ReaderOnly(storage), nil
	}

	bodyBytes, err := storage.Bytes()
	if err != nil {
		return nil, err
	}

	patchedBody, err := sjson.SetBytes(bodyBytes, "model", upstreamModelName)
	if err != nil {
		return common.ReaderOnly(storage), nil
	}

	return bytes.NewReader(patchedBody), nil
}

func shouldRewritePassThroughModel(info *relaycommon.RelayInfo) bool {
	if info == nil || info.ChannelMeta == nil {
		return false
	}
	if info.ChannelType != constant.ChannelTypeAnthropic {
		return false
	}
	return info.ChannelSetting.RewriteModelInPassThrough
}
