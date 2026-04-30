package router

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"

	// Import oauth package to register providers via init()
	_ "github.com/QuantumNous/new-api/oauth"

	"github.com/gin-contrib/gzip"
	"github.com/gin-gonic/gin"
)

func SetApiRouter(router *gin.Engine) {
	apiRouter := router.Group("/api")
	apiRouter.Use(middleware.CORS())
	apiRouter.Use(middleware.RouteTag("api"))
	apiRouter.Use(gzip.Gzip(gzip.DefaultCompression))
	apiRouter.Use(middleware.BodyStorageCleanup()) // 清理请求体存储
	apiRouter.Use(middleware.GlobalAPIRateLimit())
	{
		apiRouter.GET("/setup", controller.GetSetup)
		apiRouter.POST("/setup", controller.PostSetup)
		apiRouter.GET("/status", controller.GetStatus)
		apiRouter.GET("/uptime/status", controller.GetUptimeKumaStatus)
		apiRouter.GET("/models", middleware.UserAuth(), controller.DashboardListModels)
		apiRouter.GET("/status/test", middleware.AdminAuth(), controller.TestStatus)
		apiRouter.GET("/notice", controller.GetNotice)
		apiRouter.GET("/user-agreement", controller.GetUserAgreement)
		apiRouter.GET("/privacy-policy", controller.GetPrivacyPolicy)
		apiRouter.GET("/about", controller.GetAbout)
		//apiRouter.GET("/midjourney", controller.GetMidjourney)
		apiRouter.GET("/home_page_content", controller.GetHomePageContent)
		apiRouter.GET("/pricing", middleware.TryUserAuth(), controller.GetPricing)
		apiRouter.GET("/subscription/plans", controller.GetSubscriptionPlans) // public: no auth needed
		apiRouter.GET("/anti_distribution/public", controller.GetAntiDistributionPublicConfig)
		apiRouter.GET("/activity/lottery/current", middleware.TryUserAuth(), controller.GetActivityLotteryCurrent)
		apiRouter.GET("/activity/lottery/rounds", controller.GetActivityLotteryPublicRounds)
		apiRouter.GET("/activity/lottery/rounds/:id/entries", controller.GetActivityLotteryPublicEntries)
		apiRouter.POST("/activity/lottery/join", middleware.UserAuth(), controller.JoinActivityLotteryCurrent)
		apiRouter.GET("/verification", middleware.EmailVerificationRateLimit(), middleware.TurnstileCheck(), controller.SendEmailVerification)
		apiRouter.GET("/reset_password", middleware.CriticalRateLimit(), middleware.TurnstileCheck(), controller.SendPasswordResetEmail)
		apiRouter.POST("/user/reset", middleware.CriticalRateLimit(), controller.ResetPassword)
		// OAuth routes - specific routes must come before :provider wildcard
		apiRouter.GET("/oauth/state", middleware.CriticalRateLimit(), controller.GenerateOAuthCode)
		apiRouter.GET("/oauth/email/bind", middleware.CriticalRateLimit(), controller.EmailBind)
		// Non-standard OAuth (WeChat, Telegram) - keep original routes
		apiRouter.GET("/oauth/wechat", middleware.CriticalRateLimit(), controller.WeChatAuth)
		apiRouter.GET("/oauth/wechat/bind", middleware.CriticalRateLimit(), controller.WeChatBind)
		apiRouter.GET("/oauth/telegram/login", middleware.CriticalRateLimit(), controller.TelegramLogin)
		apiRouter.GET("/oauth/telegram/bind", middleware.CriticalRateLimit(), controller.TelegramBind)
		// Standard OAuth providers (GitHub, Discord, OIDC, LinuxDO) - unified route
		apiRouter.GET("/oauth/:provider", middleware.CriticalRateLimit(), controller.HandleOAuth)
		apiRouter.GET("/ratio_config", middleware.CriticalRateLimit(), controller.GetRatioConfig)

		apiRouter.POST("/stripe/webhook", controller.StripeWebhook)
		apiRouter.POST("/creem/webhook", controller.CreemWebhook)
		apiRouter.POST("/waffo/webhook", controller.WaffoWebhook)

		// Universal secure verification routes
		apiRouter.POST("/verify", middleware.UserAuth(), middleware.CriticalRateLimit(), controller.UniversalVerify)

		userRoute := apiRouter.Group("/user")
		{
			userRoute.POST("/register", middleware.CriticalRateLimit(), middleware.TurnstileCheck(), controller.Register)
			userRoute.POST("/login", middleware.CriticalRateLimit(), middleware.TurnstileCheck(), controller.Login)
			userRoute.POST("/login/2fa", middleware.CriticalRateLimit(), controller.Verify2FALogin)
			userRoute.POST("/passkey/login/begin", middleware.CriticalRateLimit(), controller.PasskeyLoginBegin)
			userRoute.POST("/passkey/login/finish", middleware.CriticalRateLimit(), controller.PasskeyLoginFinish)
			//userRoute.POST("/tokenlog", middleware.CriticalRateLimit(), controller.TokenLog)
			userRoute.GET("/logout", controller.Logout)
			userRoute.POST("/epay/notify", controller.EpayNotify)
			userRoute.GET("/epay/notify", controller.EpayNotify)
			userRoute.GET("/groups", controller.GetUserGroups)

			selfRoute := userRoute.Group("/")
			selfRoute.Use(middleware.UserAuth())
			{
				selfRoute.GET("/self/groups", controller.GetUserGroups)
				selfRoute.GET("/self", controller.GetSelf)
				selfRoute.GET("/models", controller.GetUserModels)
				selfRoute.PUT("/self", controller.UpdateSelf)
				selfRoute.DELETE("/self", controller.DeleteSelf)
				selfRoute.GET("/token", controller.GenerateAccessToken)
				selfRoute.GET("/passkey", controller.PasskeyStatus)
				selfRoute.POST("/passkey/register/begin", controller.PasskeyRegisterBegin)
				selfRoute.POST("/passkey/register/finish", controller.PasskeyRegisterFinish)
				selfRoute.POST("/passkey/verify/begin", controller.PasskeyVerifyBegin)
				selfRoute.POST("/passkey/verify/finish", controller.PasskeyVerifyFinish)
				selfRoute.DELETE("/passkey", controller.PasskeyDelete)
				selfRoute.GET("/aff", controller.GetAffCode)
				selfRoute.GET("/aff/details", controller.GetAffDetails)
				selfRoute.GET("/topup/info", controller.GetTopUpInfo)
				selfRoute.GET("/topup/self", controller.GetUserTopUps)
				selfRoute.GET("/redemption/history/self", controller.GetUserRedemptionHistory)
				selfRoute.POST("/topup", middleware.CriticalRateLimit(), controller.TopUp)
				selfRoute.POST("/pay", middleware.CriticalRateLimit(), controller.RequestEpay)
				selfRoute.POST("/amount", controller.RequestAmount)
				selfRoute.POST("/stripe/pay", middleware.CriticalRateLimit(), controller.RequestStripePay)
				selfRoute.POST("/stripe/amount", controller.RequestStripeAmount)
				selfRoute.POST("/creem/pay", middleware.CriticalRateLimit(), controller.RequestCreemPay)
				selfRoute.POST("/waffo/pay", middleware.CriticalRateLimit(), controller.RequestWaffoPay)
				selfRoute.POST("/aff_transfer", controller.TransferAffQuota)
				selfRoute.PUT("/setting", controller.UpdateUserSetting)

				// 2FA routes
				selfRoute.GET("/2fa/status", controller.Get2FAStatus)
				selfRoute.POST("/2fa/setup", controller.Setup2FA)
				selfRoute.POST("/2fa/enable", controller.Enable2FA)
				selfRoute.POST("/2fa/disable", controller.Disable2FA)
				selfRoute.POST("/2fa/backup_codes", controller.RegenerateBackupCodes)

				// Check-in routes
				selfRoute.GET("/checkin", controller.GetCheckinStatus)
				selfRoute.GET("/checkin/leaderboard", controller.GetCheckinLeaderboard)
				selfRoute.POST("/checkin", middleware.TurnstileCheck(), controller.DoCheckin)

				// Custom OAuth bindings
				selfRoute.GET("/oauth/bindings", controller.GetUserOAuthBindings)
				selfRoute.DELETE("/oauth/bindings/:provider_id", controller.UnbindCustomOAuth)

				// Invoice routes (user)
				selfRoute.GET("/invoice/invoiceable", controller.GetInvoiceableTopUps)
				selfRoute.GET("/invoice", controller.GetUserInvoices)
				selfRoute.POST("/invoice", controller.CreateInvoice)
				selfRoute.GET("/invoice/:id/topups", controller.GetInvoiceTopUps)
				selfRoute.POST("/invoice/:id/send", controller.SendInvoiceEmailByUser)
				selfRoute.GET("/notifications", controller.ListSelfSiteNotifications)
				selfRoute.GET("/notifications/unread_count", controller.GetSelfSiteNotificationUnreadCount)
				selfRoute.POST("/notifications/:id/read", controller.MarkSelfSiteNotificationRead)
				selfRoute.POST("/notifications/read_all", controller.MarkAllSelfSiteNotificationsRead)
				selfRoute.GET("/mail_assistant", controller.GetMailAssistantSnapshot)
				selfRoute.POST("/mail_assistant/import", controller.ImportMailAssistantAccounts)
				selfRoute.POST("/mail_assistant/pull", controller.PullMailAssistantAccounts)
				selfRoute.POST("/mail_assistant/accounts/:account_id/pull", controller.PullMailAssistantAccount)
				selfRoute.GET("/mail_assistant/ws", controller.MailAssistantWS)
			}

			adminRoute := userRoute.Group("/")
			adminRoute.Use(middleware.AdminAuth())
			{
				adminRoute.GET("/", middleware.PermissionAuth(common.PermissionPointUserView), controller.GetAllUsers)
				adminRoute.GET("/topup", controller.GetAllTopUps)
				adminRoute.GET("/redemption/history", controller.GetAllRedemptionHistory)
				adminRoute.POST("/topup/complete", controller.AdminCompleteTopUp)
				adminRoute.GET("/search", middleware.PermissionAuth(common.PermissionPointUserView), controller.SearchUsers)
				adminRoute.GET("/:id/oauth/bindings", middleware.PermissionAuth(common.PermissionPointUserView), controller.GetUserOAuthBindingsByAdmin)
				adminRoute.DELETE("/:id/oauth/bindings/:provider_id", middleware.PermissionAuth(common.PermissionPointUserEdit), controller.UnbindCustomOAuthByAdmin)
				adminRoute.DELETE("/:id/bindings/:binding_type", middleware.PermissionAuth(common.PermissionPointUserEdit), controller.AdminClearUserBinding)
				adminRoute.GET("/:id", middleware.PermissionAuth(common.PermissionPointUserView), controller.GetUser)
				adminRoute.POST("/", middleware.PermissionAuth(common.PermissionPointUserCreate), controller.CreateUser)
				adminRoute.POST("/manage", controller.ManageUser)
				adminRoute.PUT("/", middleware.PermissionAuth(common.PermissionPointUserEdit), controller.UpdateUser)
				adminRoute.DELETE("/:id", middleware.PermissionAuth(common.PermissionPointUserDelete), controller.DeleteUser)
				adminRoute.DELETE("/:id/reset_passkey", middleware.PermissionAuth(common.PermissionPointUserEdit), controller.AdminResetPasskey)
				adminRoute.POST("/notifications/send", middleware.PermissionAuth(common.PermissionPointUserNotify), controller.AdminSendSiteNotification)

				// Admin 2FA routes
				adminRoute.GET("/2fa/stats", middleware.PermissionAuth(common.PermissionPointUserView), controller.Admin2FAStats)
				adminRoute.DELETE("/:id/2fa", middleware.PermissionAuth(common.PermissionPointUserEdit), controller.AdminDisable2FA)
			}
		}

		// Subscription billing (plans, purchase, admin management)
		subscriptionRoute := apiRouter.Group("/subscription")
		subscriptionRoute.Use(middleware.UserAuth())
		{
			subscriptionRoute.GET("/self", controller.GetSubscriptionSelf)
			subscriptionRoute.GET("/self/conversion_campaign", controller.GetSelfServiceSubscriptionConversion)
			subscriptionRoute.POST("/self/conversion_campaign/request", controller.CreateSelfServiceSubscriptionConversionRequest)
			subscriptionRoute.GET("/self/consume_logs", controller.GetSubscriptionSelfConsumeLogs)
			subscriptionRoute.PUT("/self/preference", controller.UpdateSubscriptionPreference)
			subscriptionRoute.POST("/self/subscriptions/:id/action", controller.OperateSelfUserSubscription)
			subscriptionRoute.POST("/self/subscriptions/:id/day_pass", middleware.CriticalRateLimit(), controller.CreateSelfSubscriptionDayPass)
			subscriptionRoute.POST("/self/subscriptions/:id/day_pass_plan", middleware.CriticalRateLimit(), controller.CreateSelfSubscriptionDayPassPlan)
			subscriptionRoute.POST("/self/day_pass_plans/:id/cancel", middleware.CriticalRateLimit(), controller.CancelSelfSubscriptionDayPassPlan)
			subscriptionRoute.POST("/epay/pay", middleware.CriticalRateLimit(), controller.SubscriptionRequestEpay)
			subscriptionRoute.POST("/stripe/pay", middleware.CriticalRateLimit(), controller.SubscriptionRequestStripePay)
			subscriptionRoute.POST("/creem/pay", middleware.CriticalRateLimit(), controller.SubscriptionRequestCreemPay)
		}
		subscriptionAdminRoute := apiRouter.Group("/subscription/admin")
		subscriptionAdminRoute.Use(middleware.AdminAuth())
		{
			subscriptionAdminRoute.GET("/plans", middleware.PermissionAuth(common.PermissionPointSubscriptionView), controller.AdminListSubscriptionPlans)
			subscriptionAdminRoute.POST("/plans", middleware.PermissionAuth(common.PermissionPointSubscriptionCreate), controller.AdminCreateSubscriptionPlan)
			subscriptionAdminRoute.PUT("/plans/:id", middleware.PermissionAuth(common.PermissionPointSubscriptionEdit), controller.AdminUpdateSubscriptionPlan)
			subscriptionAdminRoute.PATCH("/plans/:id", middleware.PermissionAuth(common.PermissionPointSubscriptionDisable), controller.AdminUpdateSubscriptionPlanStatus)
			subscriptionAdminRoute.POST("/bind", middleware.PermissionAuth(common.PermissionPointSubscriptionEdit), controller.AdminBindSubscription)

			// User subscription management (admin)
			subscriptionAdminRoute.GET("/user_subscriptions", middleware.PermissionAuth(common.PermissionPointSubscriptionView), controller.AdminListAllUserSubscriptions)
			subscriptionAdminRoute.GET("/day_pass_plans", middleware.PermissionAuth(common.PermissionPointSubscriptionView), controller.AdminListSubscriptionDayPassPlans)
			subscriptionAdminRoute.GET("/consume_logs", middleware.PermissionAuth(common.PermissionPointSubscriptionView), controller.AdminListSubscriptionConsumeLogs)
			subscriptionAdminRoute.GET("/conversion_requests", middleware.PermissionAuth(common.PermissionPointSubscriptionView), controller.AdminListSubscriptionConversionRequests)
			subscriptionAdminRoute.POST("/conversion_requests/:id/approve", middleware.PermissionAuth(common.PermissionPointSubscriptionEdit), controller.AdminApproveSubscriptionConversionRequest)
			subscriptionAdminRoute.POST("/conversion_requests/:id/reject", middleware.PermissionAuth(common.PermissionPointSubscriptionEdit), controller.AdminRejectSubscriptionConversionRequest)
			subscriptionAdminRoute.POST("/conversion_requests/:id/mark_paid", middleware.PermissionAuth(common.PermissionPointSubscriptionEdit), controller.AdminMarkSubscriptionConversionRequestPaid)
			subscriptionAdminRoute.GET("/manual_orders", middleware.PermissionAuth(common.PermissionPointSubscriptionView), controller.AdminListManualDeliveryOrders)
			subscriptionAdminRoute.POST("/manual_orders/:id/deliver", middleware.PermissionAuth(common.PermissionPointSubscriptionEdit), controller.AdminDeliverManualDeliveryOrder)
			subscriptionAdminRoute.POST("/manual_orders/:id/reject", middleware.PermissionAuth(common.PermissionPointSubscriptionEdit), controller.AdminRejectManualDeliveryOrder)
			subscriptionAdminRoute.GET("/users/:id/subscriptions", middleware.PermissionAuth(common.PermissionPointSubscriptionView), controller.AdminListUserSubscriptions)
			subscriptionAdminRoute.POST("/users/:id/subscriptions", middleware.PermissionAuth(common.PermissionPointSubscriptionCreate), controller.AdminCreateUserSubscription)
			subscriptionAdminRoute.POST("/migrations/preview", middleware.PermissionAuth(common.PermissionPointSubscriptionEdit), controller.AdminPreviewSubscriptionMigration)
			subscriptionAdminRoute.POST("/migrations/execute", middleware.PermissionAuth(common.PermissionPointSubscriptionEdit), controller.AdminExecuteSubscriptionMigration)
			subscriptionAdminRoute.POST("/user_subscriptions/:id/action", middleware.PermissionAuth(common.PermissionPointSubscriptionEdit), controller.AdminOperateUserSubscription)
			subscriptionAdminRoute.POST("/user_subscriptions/:id/invalidate", middleware.PermissionAuth(common.PermissionPointSubscriptionEdit), controller.AdminInvalidateUserSubscription)
			subscriptionAdminRoute.POST("/user_subscriptions/:id/transfer", middleware.PermissionAuth(common.PermissionPointSubscriptionEdit), controller.AdminTransferUserSubscription)
			subscriptionAdminRoute.DELETE("/user_subscriptions/:id", middleware.PermissionAuth(common.PermissionPointSubscriptionEdit), controller.AdminDeleteUserSubscription)
			subscriptionAdminRoute.POST("/day_pass_plans/:id/cancel", middleware.PermissionAuth(common.PermissionPointSubscriptionEdit), controller.AdminCancelSubscriptionDayPassPlan)
		}

		// Subscription payment callbacks (no auth)
		apiRouter.POST("/subscription/epay/notify", controller.SubscriptionEpayNotify)
		apiRouter.GET("/subscription/epay/notify", controller.SubscriptionEpayNotify)
		apiRouter.GET("/subscription/epay/return", controller.SubscriptionEpayReturn)
		apiRouter.POST("/subscription/epay/return", controller.SubscriptionEpayReturn)
		// Invoice admin routes
		invoiceAdminRoute := apiRouter.Group("/invoice/admin")
		invoiceAdminRoute.Use(middleware.AdminAuth())
		{
			invoiceAdminRoute.GET("", middleware.PermissionAuth(common.PermissionPointInvoiceAdminView), controller.GetAllInvoices)
			invoiceAdminRoute.GET("/:id/topups", middleware.PermissionAuth(common.PermissionPointInvoiceAdminView), controller.GetInvoiceTopUpsByAdmin)
			invoiceAdminRoute.PUT("/:id", middleware.PermissionAuth(common.PermissionPointInvoiceAdminApprove), controller.UpdateInvoice)
			invoiceAdminRoute.PUT("/:id/issue", middleware.PermissionAuth(common.PermissionPointInvoiceAdminApprove), controller.IssueInvoice)
			invoiceAdminRoute.PUT("/:id/reject", middleware.PermissionAuth(common.PermissionPointInvoiceAdminReject), controller.RejectInvoice)
			invoiceAdminRoute.POST("/:id/send", middleware.PermissionAuth(common.PermissionPointInvoiceAdminApprove), controller.SendInvoiceEmail)
			invoiceAdminRoute.POST("/upload", middleware.PermissionAuth(common.PermissionPointInvoiceAdminApprove), controller.UploadInvoiceFile)
		}
		storageAdminRoute := apiRouter.Group("/storage/admin")
		storageAdminRoute.Use(middleware.RootAuth())
		{
			storageAdminRoute.GET("/objects", controller.ListStorageObjects)
			storageAdminRoute.GET("/objects/access-url", controller.GetStorageObjectAccessURL)
			storageAdminRoute.GET("/objects/content", controller.GetStorageObjectContent)
			storageAdminRoute.PUT("/objects/content", controller.UpdateStorageObjectContent)
			storageAdminRoute.POST("/directories", controller.CreateStorageDirectory)
			storageAdminRoute.POST("/objects", controller.UploadStorageObject)
			storageAdminRoute.POST("/objects/batch-delete", controller.BatchDeleteStorageObjects)
			storageAdminRoute.PUT("/objects/rename", controller.RenameStorageObject)
			storageAdminRoute.DELETE("/objects", controller.DeleteStorageObject)
		}
		financeRoute := apiRouter.Group("/finance")
		financeRoute.Use(middleware.AdminAuth())
		{
			financeRoute.GET("/overview", middleware.AnyPermissionAuth(common.PermissionPointFinanceAdminView, common.PermissionPointFinanceView), controller.GetFinanceOverview)
		}
		checkinAdminRoute := apiRouter.Group("/checkin/admin")
		checkinAdminRoute.Use(middleware.AdminAuth())
		{
			checkinAdminRoute.GET("/records", middleware.PermissionAuth(common.PermissionPointCheckinAdminView), controller.GetAdminCheckinRecords)
			checkinAdminRoute.GET("/auto_jobs", middleware.PermissionAuth(common.PermissionPointCheckinAdminView), controller.GetCheckinAutoJobs)
			checkinAdminRoute.GET("/auto_jobs/:id", middleware.PermissionAuth(common.PermissionPointCheckinAdminView), controller.GetCheckinAutoJob)
			checkinAdminRoute.POST("/auto_jobs", middleware.PermissionAuth(common.PermissionPointCheckinAdminManage), controller.CreateCheckinAutoJob)
			checkinAdminRoute.PUT("/auto_jobs/:id", middleware.PermissionAuth(common.PermissionPointCheckinAdminManage), controller.UpdateCheckinAutoJob)
			checkinAdminRoute.POST("/auto_jobs/:id/cancel", middleware.PermissionAuth(common.PermissionPointCheckinAdminManage), controller.CancelCheckinAutoJob)

		}
		activityLotteryAdminRoute := apiRouter.Group("/activity/lottery/admin")
		activityLotteryAdminRoute.Use(middleware.AdminAuth())
		{
			activityLotteryAdminRoute.GET("/rounds", middleware.PermissionAuth(common.PermissionPointActivityAdminView), controller.AdminListActivityLotteryRounds)
			activityLotteryAdminRoute.GET("/rounds/:id/entries", middleware.PermissionAuth(common.PermissionPointActivityAdminView), controller.AdminListActivityLotteryEntries)
			activityLotteryAdminRoute.POST("/rounds", middleware.PermissionAuth(common.PermissionPointActivityAdminManage), controller.AdminCreateActivityLotteryRound)
			activityLotteryAdminRoute.PUT("/rounds/:id", middleware.PermissionAuth(common.PermissionPointActivityAdminManage), controller.AdminUpdateActivityLotteryRound)
			activityLotteryAdminRoute.POST("/rounds/:id/open", middleware.PermissionAuth(common.PermissionPointActivityAdminManage), controller.AdminOpenActivityLotteryRound)
			activityLotteryAdminRoute.POST("/rounds/:id/draw", middleware.PermissionAuth(common.PermissionPointActivityAdminManage), controller.AdminDrawActivityLotteryRound)
		}
		optionRoute := apiRouter.Group("/option")
		optionRoute.Use(middleware.RootAuth())
		{
			optionRoute.GET("/", controller.GetOptions)
			optionRoute.PUT("/", controller.UpdateOption)
			optionRoute.PUT("/batch", controller.BatchUpdateOption)
			optionRoute.GET("/channel_affinity_cache", controller.GetChannelAffinityCacheStats)
			optionRoute.DELETE("/channel_affinity_cache", controller.ClearChannelAffinityCache)
			optionRoute.POST("/rest_model_ratio", controller.ResetModelRatio)
			optionRoute.POST("/migrate_console_setting", controller.MigrateConsoleSetting) // 用于迁移检测的旧键，下个版本会删除
		}
		antiDistributionRoute := apiRouter.Group("/anti_distribution")
		antiDistributionRoute.Use(middleware.AdminAuth())
		{
			antiDistributionRoute.GET("/options", controller.GetAntiDistributionOptions)
			antiDistributionRoute.PUT("/options", controller.UpdateAntiDistributionOptions)
			antiDistributionRoute.GET("/logs", controller.GetAntiDistributionLogs)
			antiDistributionRoute.POST("/reset_defaults", controller.ResetAntiDistributionDefaults)
		}

		// Custom OAuth provider management (root only)
		customOAuthRoute := apiRouter.Group("/custom-oauth-provider")
		customOAuthRoute.Use(middleware.RootAuth())
		{
			customOAuthRoute.POST("/discovery", controller.FetchCustomOAuthDiscovery)
			customOAuthRoute.GET("/", controller.GetCustomOAuthProviders)
			customOAuthRoute.GET("/:id", controller.GetCustomOAuthProvider)
			customOAuthRoute.POST("/", controller.CreateCustomOAuthProvider)
			customOAuthRoute.PUT("/:id", controller.UpdateCustomOAuthProvider)
			customOAuthRoute.DELETE("/:id", controller.DeleteCustomOAuthProvider)
		}
		performanceRoute := apiRouter.Group("/performance")
		performanceRoute.Use(middleware.RootAuth())
		{
			performanceRoute.GET("/stats", controller.GetPerformanceStats)
			performanceRoute.DELETE("/disk_cache", controller.ClearDiskCache)
			performanceRoute.POST("/reset_stats", controller.ResetPerformanceStats)
			performanceRoute.POST("/gc", controller.ForceGC)
			performanceRoute.GET("/logs", controller.GetLogFiles)
			performanceRoute.DELETE("/logs", controller.CleanupLogFiles)
		}
		ratioSyncRoute := apiRouter.Group("/ratio_sync")
		ratioSyncRoute.Use(middleware.RootAuth())
		{
			ratioSyncRoute.GET("/channels", controller.GetSyncableChannels)
			ratioSyncRoute.POST("/fetch", controller.FetchUpstreamRatios)
		}
		paymentNotifyRoute := apiRouter.Group("/payment_notify")
		paymentNotifyRoute.Use(middleware.RootAuth())
		{
			paymentNotifyRoute.PUT("/", controller.UpdatePaymentSuccessNotifySetting)
			paymentNotifyRoute.POST("/test", controller.TestPaymentSuccessNotify)
		}
		channelRoute := apiRouter.Group("/channel")
		channelRoute.Use(middleware.AdminAuth())
		{
			channelRoute.GET("/", middleware.PermissionAuth(common.PermissionPointChannelView), controller.GetAllChannels)
			channelRoute.GET("/search", middleware.PermissionAuth(common.PermissionPointChannelView), controller.SearchChannels)
			channelRoute.GET("/models", middleware.PermissionAuth(common.PermissionPointChannelView), controller.ChannelListModels)
			channelRoute.GET("/models_enabled", middleware.PermissionAuth(common.PermissionPointChannelView), controller.EnabledListModels)
			channelRoute.GET("/:id", middleware.PermissionAuth(common.PermissionPointChannelView), controller.GetChannel)
			channelRoute.POST("/:id/key", middleware.PermissionAuth(common.PermissionPointChannelSecretView), middleware.CriticalRateLimit(), middleware.DisableCache(), middleware.SecureVerificationRequired(), controller.GetChannelKey)
			channelRoute.GET("/test", middleware.PermissionAuth(common.PermissionPointChannelTest), controller.TestAllChannels)
			channelRoute.GET("/test/:id", middleware.PermissionAuth(common.PermissionPointChannelTest), controller.TestChannel)
			channelRoute.GET("/update_balance", middleware.PermissionAuth(common.PermissionPointChannelEdit), controller.UpdateAllChannelsBalance)
			channelRoute.GET("/update_balance/:id", middleware.PermissionAuth(common.PermissionPointChannelEdit), controller.UpdateChannelBalance)
			channelRoute.POST("/", middleware.PermissionAuth(common.PermissionPointChannelCreate), controller.AddChannel)
			channelRoute.PUT("/", middleware.PermissionAuth(common.PermissionPointChannelEdit), controller.UpdateChannel)
			channelRoute.DELETE("/disabled", middleware.PermissionAuth(common.PermissionPointChannelBatchDelete), controller.DeleteDisabledChannel)
			channelRoute.POST("/tag/disabled", middleware.PermissionAuth(common.PermissionPointChannelBatchEdit), controller.DisableTagChannels)
			channelRoute.POST("/tag/enabled", middleware.PermissionAuth(common.PermissionPointChannelBatchEdit), controller.EnableTagChannels)
			channelRoute.PUT("/tag", middleware.PermissionAuth(common.PermissionPointChannelBatchEdit), controller.EditTagChannels)
			channelRoute.DELETE("/:id", middleware.PermissionAuth(common.PermissionPointChannelDelete), controller.DeleteChannel)
			channelRoute.POST("/batch", middleware.PermissionAuth(common.PermissionPointChannelBatchDelete), controller.DeleteChannelBatch)
			channelRoute.PUT("/batch/models", middleware.PermissionAuth(common.PermissionPointChannelBatchEdit), controller.BatchUpdateChannelModels)
			channelRoute.POST("/fix", middleware.PermissionAuth(common.PermissionPointChannelEdit), controller.FixChannelsAbilities)
			channelRoute.GET("/fetch_models/:id", middleware.PermissionAuth(common.PermissionPointChannelUpstreamSync), controller.FetchUpstreamModels)
			channelRoute.POST("/fetch_models", middleware.PermissionAuth(common.PermissionPointChannelUpstreamSync), controller.FetchModels)
			channelRoute.POST("/codex/oauth/start", controller.StartCodexOAuth)
			channelRoute.POST("/codex/oauth/complete", controller.CompleteCodexOAuth)
			channelRoute.POST("/:id/codex/oauth/start", controller.StartCodexOAuthForChannel)
			channelRoute.POST("/:id/codex/oauth/complete", controller.CompleteCodexOAuthForChannel)
			channelRoute.POST("/:id/codex/refresh", controller.RefreshCodexChannelCredential)
			channelRoute.GET("/:id/codex/usage", controller.GetCodexChannelUsage)
			channelRoute.POST("/ollama/pull", controller.OllamaPullModel)
			channelRoute.POST("/ollama/pull/stream", controller.OllamaPullModelStream)
			channelRoute.DELETE("/ollama/delete", controller.OllamaDeleteModel)
			channelRoute.GET("/ollama/version/:id", controller.OllamaVersion)
			channelRoute.POST("/batch/tag", middleware.PermissionAuth(common.PermissionPointChannelBatchEdit), controller.BatchSetChannelTag)
			channelRoute.GET("/tag/models", middleware.PermissionAuth(common.PermissionPointChannelView), controller.GetTagModels)
			channelRoute.POST("/copy/:id", middleware.PermissionAuth(common.PermissionPointChannelCreate), controller.CopyChannel)
			channelRoute.POST("/multi_key/manage", middleware.PermissionAuth(common.PermissionPointChannelKeyManage), controller.ManageMultiKeys)
			channelRoute.POST("/upstream_updates/apply", middleware.PermissionAuth(common.PermissionPointChannelUpstreamSync), controller.ApplyChannelUpstreamModelUpdates)
			channelRoute.POST("/upstream_updates/apply_all", middleware.PermissionAuth(common.PermissionPointChannelUpstreamSync), controller.ApplyAllChannelUpstreamModelUpdates)
			channelRoute.POST("/upstream_updates/detect", middleware.PermissionAuth(common.PermissionPointChannelUpstreamSync), controller.DetectChannelUpstreamModelUpdates)
			channelRoute.POST("/upstream_updates/detect_all", middleware.PermissionAuth(common.PermissionPointChannelUpstreamSync), controller.DetectAllChannelUpstreamModelUpdates)
		}
		ecomAgentRoute := apiRouter.Group("/ecomagent")
		ecomAgentRoute.Use(middleware.RootAuth())
		{
			ecomAgentRoute.GET("/accounts", controller.GetEcomAgentAccounts)
			ecomAgentRoute.GET("/manual_orders", controller.GetEcomAgentManualDeliveryOrders)
			ecomAgentRoute.POST("/accounts", controller.CreateEcomAgentAccount)
			ecomAgentRoute.POST("/accounts/:id/edit", controller.GetEcomAgentAccount)
			ecomAgentRoute.PUT("/accounts/:id", controller.UpdateEcomAgentAccount)
			ecomAgentRoute.POST("/accounts/:id/sync", controller.SyncEcomAgentAccount)
			ecomAgentRoute.POST("/accounts/:id/deliver_manual_order", controller.DeliverEcomAgentManualDeliveryOrder)
			ecomAgentRoute.DELETE("/accounts/:id", controller.DeleteEcomAgentAccount)
		}
		tokenRoute := apiRouter.Group("/token")
		tokenRoute.Use(middleware.UserAuth())
		{
			tokenRoute.GET("/admin", middleware.AdminAuth(), middleware.PermissionAuth(common.PermissionPointTokenAdminView), controller.GetAllTokensByAdmin)
			tokenRoute.GET("/admin/search", middleware.AdminAuth(), middleware.PermissionAuth(common.PermissionPointTokenAdminView), middleware.SearchRateLimit(), controller.SearchTokensByAdmin)
			tokenRoute.POST("/admin/:id/test", middleware.AdminAuth(), middleware.PermissionAuth(common.PermissionPointTokenAdminEdit), middleware.TokenTestRateLimit(), middleware.DisableCache(), controller.TestTokenByAdmin)
			tokenRoute.POST("/admin/:id/rotate", middleware.AdminAuth(), middleware.PermissionAuth(common.PermissionPointTokenAdminSecretView), middleware.CriticalRateLimit(), middleware.DisableCache(), middleware.SecureVerificationRequired(), controller.RotateTokenByAdmin)
			tokenRoute.POST("/admin/batch/group", middleware.AdminAuth(), middleware.PermissionAuth(common.PermissionPointTokenAdminEdit), middleware.CriticalRateLimit(), middleware.DisableCache(), middleware.SecureVerificationRequired(), controller.UpdateTokenGroupBatchByAdmin)
			tokenRoute.GET("/", controller.GetAllTokens)
			tokenRoute.GET("/search", middleware.SearchRateLimit(), controller.SearchTokens)
			tokenRoute.GET("/:id", controller.GetToken)
			tokenRoute.POST("/:id/key", middleware.CriticalRateLimit(), middleware.DisableCache(), controller.GetTokenKey)
			tokenRoute.POST("/:id/test", middleware.TokenTestRateLimit(), middleware.DisableCache(), controller.TestToken)
			tokenRoute.POST("/batch/invalid", controller.DeleteInvalidTokenBatch)
			tokenRoute.POST("/", controller.AddToken)
			tokenRoute.PUT("/", controller.UpdateToken)
			tokenRoute.DELETE("/:id", controller.DeleteToken)
			tokenRoute.POST("/batch", controller.DeleteTokenBatch)
		}

		usageRoute := apiRouter.Group("/usage")
		usageRoute.Use(middleware.CORS(), middleware.CriticalRateLimit())
		{
			tokenUsageRoute := usageRoute.Group("/token")
			tokenUsageRoute.Use(middleware.TokenAuthReadOnly())
			{
				tokenUsageRoute.GET("/", controller.GetTokenUsage)
			}
		}

		redemptionRoute := apiRouter.Group("/redemption")
		redemptionRoute.Use(middleware.AdminAuth())
		{
			redemptionRoute.GET("/", middleware.PermissionAuth(common.PermissionPointRedemptionView), controller.GetAllRedemptions)
			redemptionRoute.GET("/search", middleware.PermissionAuth(common.PermissionPointRedemptionView), controller.SearchRedemptions)
			redemptionRoute.GET("/:id", middleware.PermissionAuth(common.PermissionPointRedemptionView), controller.GetRedemption)
			redemptionRoute.POST("/", middleware.PermissionAuth(common.PermissionPointRedemptionCreate), controller.AddRedemption)
			redemptionRoute.PUT("/", middleware.PermissionAuth(common.PermissionPointRedemptionEdit), controller.UpdateRedemption)
			redemptionRoute.DELETE("/invalid", middleware.PermissionAuth(common.PermissionPointRedemptionDelete), controller.DeleteInvalidRedemption)
			redemptionRoute.DELETE("/:id", middleware.PermissionAuth(common.PermissionPointRedemptionDelete), controller.DeleteRedemption)
		}
		logRoute := apiRouter.Group("/log")
		logRoute.GET("/", middleware.AdminAuth(), middleware.PermissionAuth(common.PermissionPointLogView), controller.GetAllLogs)
		logRoute.GET("/export", middleware.AdminAuth(), middleware.PermissionAuth(common.PermissionPointLogExport), controller.ExportAllLogs)
		logRoute.POST("/batch_delete", middleware.AdminAuth(), middleware.PermissionAuth(common.PermissionPointLogView), controller.BatchDeleteLogs)
		logRoute.DELETE("/", middleware.AdminAuth(), middleware.PermissionAuth(common.PermissionPointLogView), controller.DeleteHistoryLogs)
		logRoute.GET("/stat", middleware.AdminAuth(), middleware.PermissionAuth(common.PermissionPointLogView), controller.GetLogsStat)
		logRoute.GET("/group_health", middleware.AdminAuth(), middleware.PermissionAuth(common.PermissionPointLogView), controller.GetGroupLogHealthStats)
		logRoute.GET("/self/stat", middleware.UserAuth(), controller.GetLogsSelfStat)
		logRoute.GET("/image/:request_id/:index/download", middleware.UserAuth(), controller.DownloadLogImage)
		logRoute.GET("/self/group_health", middleware.UserAuth(), controller.GetGroupLogSelfHealthStats)
		logRoute.GET("/channel_affinity_usage_cache", middleware.AdminAuth(), middleware.PermissionAuth(common.PermissionPointLogView), controller.GetChannelAffinityUsageCacheStats)
		logRoute.GET("/search", middleware.AdminAuth(), middleware.PermissionAuth(common.PermissionPointLogView), controller.SearchAllLogs)
		logRoute.GET("/self", middleware.UserAuth(), controller.GetUserLogs)
		logRoute.GET("/self/export", middleware.UserAuth(), controller.ExportUserLogs)
		logRoute.GET("/self/search", middleware.UserAuth(), middleware.SearchRateLimit(), controller.SearchUserLogs)

		dataRoute := apiRouter.Group("/data")
		dataRoute.GET("/", middleware.AdminAuth(), controller.GetAllQuotaDates)
		dataRoute.GET("/self", middleware.UserAuth(), controller.GetUserQuotaDates)

		logRoute.Use(middleware.CORS(), middleware.CriticalRateLimit())
		{
			logRoute.GET("/token", middleware.TokenAuthReadOnly(), controller.GetLogByKey)
		}
		groupRoute := apiRouter.Group("/group")
		groupRoute.Use(middleware.AdminAuth())
		{
			groupRoute.GET("/", controller.GetGroups)
		}

		prefillGroupRoute := apiRouter.Group("/prefill_group")
		prefillGroupRoute.Use(middleware.AdminAuth())
		{
			prefillGroupRoute.GET("/", controller.GetPrefillGroups)
			prefillGroupRoute.POST("/", controller.CreatePrefillGroup)
			prefillGroupRoute.PUT("/", controller.UpdatePrefillGroup)
			prefillGroupRoute.DELETE("/:id", controller.DeletePrefillGroup)
		}

		mjRoute := apiRouter.Group("/mj")
		mjRoute.GET("/self", middleware.UserAuth(), controller.GetUserMidjourney)
		mjRoute.GET("/", middleware.AdminAuth(), controller.GetAllMidjourney)

		taskRoute := apiRouter.Group("/task")
		{
			taskRoute.GET("/self", middleware.UserAuth(), controller.GetUserTask)
			taskRoute.GET("/", middleware.AdminAuth(), controller.GetAllTask)
		}

		vendorRoute := apiRouter.Group("/vendors")
		vendorRoute.Use(middleware.AdminAuth())
		{
			vendorRoute.GET("/", controller.GetAllVendors)
			vendorRoute.GET("/search", controller.SearchVendors)
			vendorRoute.GET("/:id", controller.GetVendorMeta)
			vendorRoute.POST("/", controller.CreateVendorMeta)
			vendorRoute.PUT("/", controller.UpdateVendorMeta)
			vendorRoute.DELETE("/:id", controller.DeleteVendorMeta)
		}

		modelsRoute := apiRouter.Group("/models")
		modelsRoute.Use(middleware.AdminAuth())
		{
			modelsRoute.GET("/sync_upstream/preview", middleware.PermissionAuth(common.PermissionPointModelView), controller.SyncUpstreamPreview)
			modelsRoute.POST("/sync_upstream", middleware.PermissionAuth(common.PermissionPointModelEdit), controller.SyncUpstreamModels)
			modelsRoute.GET("/missing", middleware.PermissionAuth(common.PermissionPointModelView), controller.GetMissingModels)
			modelsRoute.GET("/", middleware.PermissionAuth(common.PermissionPointModelView), controller.GetAllModelsMeta)
			modelsRoute.GET("/search", middleware.PermissionAuth(common.PermissionPointModelView), controller.SearchModelsMeta)
			modelsRoute.GET("/:id", middleware.PermissionAuth(common.PermissionPointModelView), controller.GetModelMeta)
			modelsRoute.POST("/", middleware.PermissionAuth(common.PermissionPointModelEdit), controller.CreateModelMeta)
			modelsRoute.PUT("/", middleware.PermissionAuth(common.PermissionPointModelEdit), controller.UpdateModelMeta)
			modelsRoute.DELETE("/:id", middleware.PermissionAuth(common.PermissionPointModelEdit), controller.DeleteModelMeta)
		}

		// Deployments (model deployment management)
		deploymentsRoute := apiRouter.Group("/deployments")
		deploymentsRoute.Use(middleware.AdminAuth())
		{
			deploymentsRoute.GET("/settings", middleware.PermissionAuth(common.PermissionPointDeploymentView), controller.GetModelDeploymentSettings)
			deploymentsRoute.POST("/settings/test-connection", middleware.PermissionAuth(common.PermissionPointDeploymentEdit), controller.TestIoNetConnection)
			deploymentsRoute.GET("/", middleware.PermissionAuth(common.PermissionPointDeploymentView), controller.GetAllDeployments)
			deploymentsRoute.GET("/search", middleware.PermissionAuth(common.PermissionPointDeploymentView), controller.SearchDeployments)
			deploymentsRoute.POST("/test-connection", middleware.PermissionAuth(common.PermissionPointDeploymentEdit), controller.TestIoNetConnection)
			deploymentsRoute.GET("/hardware-types", middleware.PermissionAuth(common.PermissionPointDeploymentView), controller.GetHardwareTypes)
			deploymentsRoute.GET("/locations", middleware.PermissionAuth(common.PermissionPointDeploymentView), controller.GetLocations)
			deploymentsRoute.GET("/available-replicas", middleware.PermissionAuth(common.PermissionPointDeploymentView), controller.GetAvailableReplicas)
			deploymentsRoute.POST("/price-estimation", middleware.PermissionAuth(common.PermissionPointDeploymentView), controller.GetPriceEstimation)
			deploymentsRoute.GET("/check-name", middleware.PermissionAuth(common.PermissionPointDeploymentView), controller.CheckClusterNameAvailability)
			deploymentsRoute.POST("/", middleware.PermissionAuth(common.PermissionPointDeploymentPublish), controller.CreateDeployment)

			deploymentsRoute.GET("/:id", middleware.PermissionAuth(common.PermissionPointDeploymentView), controller.GetDeployment)
			deploymentsRoute.GET("/:id/logs", middleware.PermissionAuth(common.PermissionPointDeploymentView), controller.GetDeploymentLogs)
			deploymentsRoute.GET("/:id/containers", middleware.PermissionAuth(common.PermissionPointDeploymentView), controller.ListDeploymentContainers)
			deploymentsRoute.GET("/:id/containers/:container_id", middleware.PermissionAuth(common.PermissionPointDeploymentView), controller.GetContainerDetails)
			deploymentsRoute.PUT("/:id", middleware.PermissionAuth(common.PermissionPointDeploymentEdit), controller.UpdateDeployment)
			deploymentsRoute.PUT("/:id/name", middleware.PermissionAuth(common.PermissionPointDeploymentEdit), controller.UpdateDeploymentName)
			deploymentsRoute.POST("/:id/extend", middleware.PermissionAuth(common.PermissionPointDeploymentPublish), controller.ExtendDeployment)
			deploymentsRoute.DELETE("/:id", middleware.PermissionAuth(common.PermissionPointDeploymentEdit), controller.DeleteDeployment)
		}
	}
}
