package common

import (
	"errors"
	"sort"
	"strings"
)

var ErrInvalidPermissionPointsJSON = errors.New("invalid permission points json")

const (
	PermissionPointDashboardView        = "dashboard.view"
	PermissionPointPackageView          = "package.view"
	PermissionPointTokenView            = "token.view"
	PermissionPointLogView              = "log.view"
	PermissionPointLogExport            = "log.export"
	PermissionPointMidjourneyLogView    = "midjourney_log.view"
	PermissionPointTaskLogView          = "task_log.view"
	PermissionPointCheckinLotteryView   = "checkin_lottery.view"
	PermissionPointActivityLotteryView  = "activity_lottery.view"
	PermissionPointTopUpView            = "topup.view"
	PermissionPointInvoiceView          = "invoice.view"
	PermissionPointInviteView           = "invite.view"
	PermissionPointPersonalView         = "personal.view"
	PermissionPointSiteNotificationView = "site_notification.view"

	PermissionPointChannelView       = "channel.view"
	PermissionPointSubscriptionView  = "subscription.view"
	PermissionPointModelView         = "model.view"
	PermissionPointDeploymentView    = "deployment.view"
	PermissionPointRedemptionView    = "redemption.view"
	PermissionPointTokenAdminView    = "token_admin.view"
	PermissionPointUserView          = "user.view"
	PermissionPointRiskControlView   = "risk_control.view"
	PermissionPointFinanceAdminView  = "finance_admin.view"
	PermissionPointInvoiceAdminView  = "invoice_admin.view"
	PermissionPointSettingView       = "setting.view"
	PermissionPointR2StorageView     = "r2_storage.view"
	PermissionPointCheckinAdminView  = "checkin_admin.view"
	PermissionPointEcomAgentView     = "ecomagent.view"
	PermissionPointActivityAdminView = "activity_admin.view"

	PermissionPointChannelCreate       = "channel.create"
	PermissionPointChannelEdit         = "channel.edit"
	PermissionPointChannelDelete       = "channel.delete"
	PermissionPointChannelTest         = "channel.test"
	PermissionPointChannelBatchEdit    = "channel.batch_edit"
	PermissionPointChannelBatchDelete  = "channel.batch_delete"
	PermissionPointChannelKeyManage    = "channel.key.manage"
	PermissionPointChannelSecretView   = "channel.secret.view"
	PermissionPointChannelUpstreamSync = "channel.upstream.sync"

	PermissionPointModelEdit         = "model.edit"
	PermissionPointDeploymentEdit    = "deployment.edit"
	PermissionPointDeploymentPublish = "deployment.publish"

	PermissionPointSubscriptionCreate     = "subscription.create"
	PermissionPointSubscriptionEdit       = "subscription.edit"
	PermissionPointSubscriptionDisable    = "subscription.disable"
	PermissionPointSubscriptionResetUsage = "subscription.reset_usage"

	PermissionPointRedemptionCreate = "redemption.create"
	PermissionPointRedemptionEdit   = "redemption.edit"
	PermissionPointRedemptionDelete = "redemption.delete"

	PermissionPointUserCreate  = "user.create"
	PermissionPointUserEdit    = "user.edit"
	PermissionPointUserDisable = "user.disable"
	PermissionPointUserDelete  = "user.delete"
	PermissionPointUserNotify  = "user.notify"

	PermissionPointTokenAdminCreate     = "token_admin.create"
	PermissionPointTokenAdminEdit       = "token_admin.edit"
	PermissionPointTokenAdminDelete     = "token_admin.delete"
	PermissionPointTokenAdminSecretView = "token_admin.secret.view"

	PermissionPointRiskControlEdit    = "risk_control.edit"
	PermissionPointRiskControlExecute = "risk_control.execute"

	PermissionPointFinanceView   = "finance.view"
	PermissionPointFinanceExport = "finance.export"

	PermissionPointInvoiceAdminApprove = "invoice_admin.approve"
	PermissionPointInvoiceAdminReject  = "invoice_admin.reject"

	PermissionPointSettingEdit          = "setting.edit"
	PermissionPointSettingDangerousEdit = "setting.dangerous.edit"
	PermissionPointR2StorageManage      = "r2_storage.manage"
	PermissionPointEcomAgentManage      = "ecomagent.manage"

	PermissionPointCheckinAdminManage  = "checkin_admin.manage"
	PermissionPointActivityAdminManage = "activity_admin.manage"
)

const (
	PermissionProfileSupportAdmin  = "support_admin"
	PermissionProfileOpsAdmin      = "ops_admin"
	PermissionProfileFinanceAdmin  = "finance_admin"
	PermissionProfileRiskAdmin     = "risk_admin"
	PermissionProfileActivityAdmin = "activity_admin"
	PermissionProfileRoot          = "root"
)

var allPermissionPoints = []string{
	PermissionPointDashboardView,
	PermissionPointPackageView,
	PermissionPointTokenView,
	PermissionPointLogView,
	PermissionPointLogExport,
	PermissionPointMidjourneyLogView,
	PermissionPointTaskLogView,
	PermissionPointCheckinLotteryView,
	PermissionPointActivityLotteryView,
	PermissionPointTopUpView,
	PermissionPointInvoiceView,
	PermissionPointInviteView,
	PermissionPointPersonalView,
	PermissionPointSiteNotificationView,
	PermissionPointChannelView,
	PermissionPointSubscriptionView,
	PermissionPointModelView,
	PermissionPointDeploymentView,
	PermissionPointRedemptionView,
	PermissionPointTokenAdminView,
	PermissionPointUserView,
	PermissionPointRiskControlView,
	PermissionPointFinanceAdminView,
	PermissionPointInvoiceAdminView,
	PermissionPointSettingView,
	PermissionPointR2StorageView,
	PermissionPointCheckinAdminView,
	PermissionPointEcomAgentView,
	PermissionPointActivityAdminView,
	PermissionPointChannelCreate,
	PermissionPointChannelEdit,
	PermissionPointChannelDelete,
	PermissionPointChannelTest,
	PermissionPointChannelBatchEdit,
	PermissionPointChannelBatchDelete,
	PermissionPointChannelKeyManage,
	PermissionPointChannelSecretView,
	PermissionPointChannelUpstreamSync,
	PermissionPointModelEdit,
	PermissionPointDeploymentEdit,
	PermissionPointDeploymentPublish,
	PermissionPointSubscriptionCreate,
	PermissionPointSubscriptionEdit,
	PermissionPointSubscriptionDisable,
	PermissionPointSubscriptionResetUsage,
	PermissionPointRedemptionCreate,
	PermissionPointRedemptionEdit,
	PermissionPointRedemptionDelete,
	PermissionPointUserCreate,
	PermissionPointUserEdit,
	PermissionPointUserDisable,
	PermissionPointUserDelete,
	PermissionPointUserNotify,
	PermissionPointTokenAdminCreate,
	PermissionPointTokenAdminEdit,
	PermissionPointTokenAdminDelete,
	PermissionPointTokenAdminSecretView,
	PermissionPointRiskControlEdit,
	PermissionPointRiskControlExecute,
	PermissionPointFinanceView,
	PermissionPointFinanceExport,
	PermissionPointInvoiceAdminApprove,
	PermissionPointInvoiceAdminReject,
	PermissionPointSettingEdit,
	PermissionPointSettingDangerousEdit,
	PermissionPointR2StorageManage,
	PermissionPointEcomAgentManage,
	PermissionPointCheckinAdminManage,
	PermissionPointActivityAdminManage,
}

var allowedPermissionPoints = func() map[string]struct{} {
	allowed := make(map[string]struct{}, len(allPermissionPoints))
	for _, point := range allPermissionPoints {
		allowed[point] = struct{}{}
	}
	return allowed
}()

var permissionProfiles = map[string][]string{
	PermissionProfileSupportAdmin: {
		PermissionPointUserView,
		PermissionPointUserEdit,
		PermissionPointUserDisable,
		PermissionPointUserNotify,
		PermissionPointSubscriptionView,
		PermissionPointSubscriptionEdit,
		PermissionPointLogView,
		PermissionPointRiskControlView,
		PermissionPointSiteNotificationView,
	},
	PermissionProfileOpsAdmin: {
		PermissionPointChannelView,
		PermissionPointChannelCreate,
		PermissionPointChannelEdit,
		PermissionPointChannelTest,
		PermissionPointModelView,
		PermissionPointModelEdit,
		PermissionPointDeploymentView,
		PermissionPointDeploymentEdit,
		PermissionPointDeploymentPublish,
		PermissionPointLogView,
		PermissionPointSubscriptionView,
	},
	PermissionProfileFinanceAdmin: {
		PermissionPointFinanceAdminView,
		PermissionPointFinanceView,
		PermissionPointFinanceExport,
		PermissionPointInvoiceAdminView,
		PermissionPointInvoiceAdminApprove,
		PermissionPointInvoiceAdminReject,
		PermissionPointSubscriptionView,
		PermissionPointUserView,
	},
	PermissionProfileRiskAdmin: {
		PermissionPointRiskControlView,
		PermissionPointRiskControlEdit,
		PermissionPointRiskControlExecute,
		PermissionPointLogView,
		PermissionPointLogExport,
		PermissionPointUserView,
		PermissionPointUserDisable,
		PermissionPointSubscriptionView,
	},
	PermissionProfileActivityAdmin: {
		PermissionPointCheckinAdminView,
		PermissionPointCheckinAdminManage,
		PermissionPointActivityAdminView,
		PermissionPointActivityAdminManage,
		PermissionPointActivityLotteryView,
		PermissionPointCheckinLotteryView,
	},
}

var defaultAdminPermissionPoints = NormalizePermissionPoints(append(
	append(
		append([]string{}, permissionProfiles[PermissionProfileSupportAdmin]...),
		permissionProfiles[PermissionProfileOpsAdmin]...,
	),
	permissionProfiles[PermissionProfileRiskAdmin]...,
))

func rootPermissionPoints() []string {
	return AllPermissionPoints()
}

func PermissionProfiles() map[string][]string {
	result := make(map[string][]string, len(permissionProfiles))
	for name, points := range permissionProfiles {
		result[name] = append([]string(nil), points...)
	}
	return result
}

func PermissionPointsForProfile(profile string) []string {
	if profile == PermissionProfileRoot {
		return rootPermissionPoints()
	}
	points, ok := permissionProfiles[profile]
	if !ok {
		return []string{}
	}
	return append([]string(nil), points...)
}

func DefaultAdminPermissionPoints() []string {
	return append([]string(nil), defaultAdminPermissionPoints...)
}

func AllPermissionPoints() []string {
	return append([]string(nil), allPermissionPoints...)
}

func ParsePermissionPointsJSON(raw string) ([]string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return []string{}, nil
	}
	var arrayPoints []string
	if err := UnmarshalJsonStr(raw, &arrayPoints); err == nil {
		return NormalizePermissionPoints(arrayPoints), nil
	}
	var mapPoints map[string]bool
	if err := UnmarshalJsonStr(raw, &mapPoints); err == nil {
		points := make([]string, 0, len(mapPoints))
		for point, enabled := range mapPoints {
			if enabled {
				points = append(points, point)
			}
		}
		return NormalizePermissionPoints(points), nil
	}
	return nil, ErrInvalidPermissionPointsJSON
}

func NormalizePermissionPoints(points []string) []string {
	if len(points) == 0 {
		return []string{}
	}
	unique := make(map[string]struct{}, len(points))
	result := make([]string, 0, len(points))
	for _, point := range points {
		point = strings.TrimSpace(point)
		if point == "" {
			continue
		}
		if _, ok := allowedPermissionPoints[point]; !ok {
			continue
		}
		if _, exists := unique[point]; exists {
			continue
		}
		unique[point] = struct{}{}
		result = append(result, point)
	}
	sort.Strings(result)
	return result
}

func ResolvePermissionPoints(role int, permissionsJSON string) []string {
	switch role {
	case RoleRootUser:
		return rootPermissionPoints()
	case RoleAdminUser:
		if strings.TrimSpace(permissionsJSON) == "" {
			return DefaultAdminPermissionPoints()
		}
		customPoints, err := ParsePermissionPointsJSON(permissionsJSON)
		if err != nil {
			return []string{}
		}
		return customPoints
	default:
		return []string{}
	}
}

func HasPermission(role int, permissionsJSON string, permission string) bool {
	for _, point := range ResolvePermissionPoints(role, permissionsJSON) {
		if point == permission {
			return true
		}
	}
	return false
}

func BuildPermissionPointMap(points []string) map[string]bool {
	permissionMap := make(map[string]bool, len(points))
	for _, point := range points {
		permissionMap[point] = true
	}
	return permissionMap
}

func BuildSidebarPermissionModules(role int, permissionsJSON string) map[string]interface{} {
	if role == RoleRootUser {
		return map[string]interface{}{}
	}

	points := BuildPermissionPointMap(ResolvePermissionPoints(role, permissionsJSON))
	if len(points) == 0 {
		return map[string]interface{}{"admin": false}
	}

	adminModules := map[string]interface{}{
		"channel":       points[PermissionPointChannelView],
		"subscription":  points[PermissionPointSubscriptionView],
		"models":        points[PermissionPointModelView],
		"deployment":    points[PermissionPointDeploymentView],
		"redemption":    points[PermissionPointRedemptionView],
		"tokenAdmin":    points[PermissionPointTokenAdminView],
		"user":          points[PermissionPointUserView],
		"riskControl":   points[PermissionPointRiskControlView],
		"financeAdmin":  points[PermissionPointFinanceAdminView],
		"invoiceAdmin":  points[PermissionPointInvoiceAdminView],
		"setting":       points[PermissionPointSettingView],
		"r2Storage":     points[PermissionPointR2StorageView],
		"checkinAdmin":  points[PermissionPointCheckinAdminView],
		"activityAdmin": points[PermissionPointActivityAdminView],
		"ecomagent":     points[PermissionPointEcomAgentView],
	}
	hasAdminModule := false
	for _, value := range adminModules {
		if enabled, ok := value.(bool); ok && enabled {
			hasAdminModule = true
			break
		}
	}
	if !hasAdminModule {
		return map[string]interface{}{"admin": false}
	}

	disabledModules := map[string]interface{}{}
	for key, value := range adminModules {
		if enabled, ok := value.(bool); ok && !enabled {
			disabledModules[key] = false
		}
	}
	return map[string]interface{}{"admin": disabledModules}
}
