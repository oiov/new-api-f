package billing_setting

import (
	"fmt"
	"math"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/samber/lo"
)

const (
	BillingModeRatio      = "ratio"
	BillingModeTieredExpr = "tiered_expr"
	BillingModeField      = "billing_mode"
	BillingExprField      = "billing_expr"
)

// BillingSetting is managed by config.GlobalConfig.Register.
// DB keys: billing_setting.billing_mode, billing_setting.billing_expr
type BillingSetting struct {
	BillingMode map[string]string `json:"billing_mode"`
	BillingExpr map[string]string `json:"billing_expr"`
}

var billingSetting = BillingSetting{
	BillingMode: make(map[string]string),
	BillingExpr: make(map[string]string),
}

func init() {
	config.GlobalConfig.Register("billing_setting", &billingSetting)
}

// ---------------------------------------------------------------------------
// Read accessors (hot path, must be fast)
// ---------------------------------------------------------------------------

func GetBillingMode(model string) string {
	if mode, ok := billingSetting.BillingMode[model]; ok {
		return mode
	}
	return BillingModeRatio
}

func GetBillingExpr(model string) (string, bool) {
	expr, ok := billingSetting.BillingExpr[model]
	return expr, ok
}

func GetBillingModeCopy() map[string]string {
	return lo.Assign(billingSetting.BillingMode)
}

func GetBillingExprCopy() map[string]string {
	return lo.Assign(billingSetting.BillingExpr)
}

func GetPricingSyncData(base map[string]any) map[string]any {
	extra := make(map[string]any, 2)
	if modes := GetBillingModeCopy(); len(modes) > 0 {
		extra[BillingModeField] = modes
	}
	if exprs := GetBillingExprCopy(); len(exprs) > 0 {
		extra[BillingExprField] = exprs
	}
	return lo.Assign(base, extra)
}

// ---------------------------------------------------------------------------
// Smoke test (called externally for validation before save)
// ---------------------------------------------------------------------------

func SmokeTestExpr(exprStr string) error {
	return smokeTestExpr(exprStr)
}

// ValidateBillingExprJSON validates the JSON map form persisted under the
// option key `billing_setting.billing_expr` (shape: {"model-name": "expr"}).
// Each non-empty expression is smoke-tested; an empty/whitespace value clears
// the model's expression and is allowed. Returns the first offending model's error.
func ValidateBillingExprJSON(jsonStr string) error {
	if strings.TrimSpace(jsonStr) == "" {
		return nil
	}
	exprMap := make(map[string]string)
	if err := common.UnmarshalJsonStr(jsonStr, &exprMap); err != nil {
		return fmt.Errorf("解析计费表达式配置失败: %w", err)
	}
	for modelName, exprStr := range exprMap {
		if strings.TrimSpace(exprStr) == "" {
			continue
		}
		if err := smokeTestExpr(exprStr); err != nil {
			return fmt.Errorf("模型 %s 的计费表达式无效: %w", modelName, err)
		}
	}
	return nil
}

func smokeTestExpr(exprStr string) error {
	// Vectors deliberately include asymmetric p/c and populated cache/media
	// fields: with only p == c vectors, differential expressions like
	// `(p - c) * k` evaluate to exactly 0 on every vector and a
	// negative-at-runtime expression would pass validation.
	vectors := []billingexpr.TokenParams{
		{P: 0, C: 0, Len: 0},
		{P: 1000, C: 1000, Len: 1000},
		{P: 100000, C: 100000, Len: 100000},
		{P: 1000000, C: 1000000, Len: 1000000},
		{P: 500000, C: 0, Len: 500000},
		{P: 0, C: 500000, Len: 0},
		{P: 1000, C: 200000, Len: 1000},
		{P: 300000, C: 500, Len: 400000, CR: 80000, CC: 15000, CC1h: 5000, Img: 2000, ImgO: 1000, AI: 3000, AO: 1500},
	}
	requests := []billingexpr.RequestInput{
		{},
		{
			Headers: map[string]string{
				"anthropic-beta": "fast-mode-2026-02-01",
			},
			Body: []byte(`{"service_tier":"fast","stream_options":{"include_usage":true},"messages":[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21]}`),
		},
	}

	for _, v := range vectors {
		for _, request := range requests {
			result, _, err := billingexpr.RunExprWithRequest(exprStr, v, request)
			if err != nil {
				return fmt.Errorf("vector {p=%g, c=%g}: run failed: %w", v.P, v.C, err)
			}
			// NaN compares false with everything and +Inf is > 0, so an
			// explicit check is required: at settle time NaN bills 0 (free
			// rides) and +Inf saturates to int32 max (a ~$4k charge).
			if math.IsNaN(result) || math.IsInf(result, 0) {
				return fmt.Errorf("vector {p=%g, c=%g}: result is not a finite number (NaN/Inf, e.g. division by zero)", v.P, v.C)
			}
			if result < 0 {
				return fmt.Errorf("vector {p=%g, c=%g}: result %f < 0", v.P, v.C, result)
			}
		}
	}
	return nil
}
