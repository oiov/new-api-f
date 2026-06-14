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
// It also applies param overrides (via sjson) so that pass-through and param
// override can coexist without the expensive DTO round-trip.
func BuildPassThroughRequestBody(c *gin.Context, info *relaycommon.RelayInfo) (io.Reader, error) {
	storage, err := common.GetBodyStorage(c)
	if err != nil {
		return nil, err
	}

	isJSON := c != nil && c.Request != nil && strings.HasPrefix(c.Request.Header.Get("Content-Type"), "application/json")

	if !isJSON {
		return common.ReaderOnly(storage), nil
	}

	needModelRewrite := shouldRewritePassThroughModel(info) && strings.TrimSpace(info.UpstreamModelName) != ""
	needParamOverride := info != nil && len(info.ParamOverride) > 0

	if !needModelRewrite && !needParamOverride {
		return common.ReaderOnly(storage), nil
	}

	bodyBytes, err := storage.Bytes()
	if err != nil {
		return nil, err
	}

	if needModelRewrite {
		bodyBytes, err = sjson.SetBytes(bodyBytes, "model", strings.TrimSpace(info.UpstreamModelName))
		if err != nil {
			return nil, err
		}
	}

	if needParamOverride {
		bodyBytes, err = relaycommon.ApplyParamOverrideWithRelayInfo(bodyBytes, info)
		if err != nil {
			return nil, err
		}
	}

	return bytes.NewReader(bodyBytes), nil
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
