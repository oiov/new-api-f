package common

import (
	"strings"

	"github.com/QuantumNous/new-api/setting/operation_setting"
)

func DisplayedResponseModelName(info *RelayInfo, currentModel string) string {
	currentModel = strings.TrimSpace(currentModel)
	if info == nil {
		return currentModel
	}
	if operation_setting.UpstreamModelNameAlignedToRequestEnabled {
		originModelName := strings.TrimSpace(info.OriginModelName)
		if originModelName != "" {
			return originModelName
		}
	}
	return currentModel
}
