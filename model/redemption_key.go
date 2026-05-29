package model

import (
	"errors"

	"github.com/QuantumNous/new-api/common"
)

const (
	RedemptionKeyPrefixSubscription = "nbredemptionP"
	RedemptionKeyPrefixQuota        = "nbredemptionQ"
	RedemptionKeyTotalLength        = 32
)

// BuildRedemptionKey 生成 32 位兑换码（含类型前缀）。
func BuildRedemptionKey(redemptionType string) (string, error) {
	prefix := RedemptionKeyPrefixQuota
	if NormalizeRedemptionType(redemptionType) == RedemptionTypeSubscription {
		prefix = RedemptionKeyPrefixSubscription
	}
	suffixLength := RedemptionKeyTotalLength - len(prefix)
	if suffixLength <= 0 {
		return "", errors.New("invalid redemption key prefix length")
	}
	suffix, err := common.GenerateRandomCharsKey(suffixLength)
	if err != nil {
		return "", err
	}
	return prefix + suffix, nil
}
