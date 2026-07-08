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

	// storageReader 返回原始 storage body，并把字节数记录到 info.UpstreamRequestBodySize。
	// storage 经 common.ReaderOnly 包装后是 type-erased io.Reader，net/http 无法自探测
	// 长度，需据此手动填充 Content-Length，否则退化为 chunked encoding(GLM 等上游会报错)。
	storageReader := func() io.Reader {
		if info != nil {
			info.UpstreamRequestBodySize = storage.Size()
		}
		return common.ReaderOnly(storage)
	}

	if c == nil || c.Request == nil || !strings.HasPrefix(c.Request.Header.Get("Content-Type"), "application/json") {
		return storageReader(), nil
	}

	if !shouldRewritePassThroughModel(info) {
		return storageReader(), nil
	}

	upstreamModelName := strings.TrimSpace(info.UpstreamModelName)
	if upstreamModelName == "" {
		return storageReader(), nil
	}

	bodyBytes, err := storage.Bytes()
	if err != nil {
		return nil, err
	}

	patchedBody, err := sjson.SetBytes(bodyBytes, "model", upstreamModelName)
	if err != nil {
		return storageReader(), nil
	}

	if info != nil {
		info.UpstreamRequestBodySize = int64(len(patchedBody))
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
