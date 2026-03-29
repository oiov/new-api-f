package controller

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
)

func TelegramBind(c *gin.Context) {
	if !common.IsTelegramOAuthFlowEnabled() {
		c.JSON(200, gin.H{
			"message": "管理员未开启通过 Telegram 登录或注册",
			"success": false,
		})
		return
	}
	params := c.Request.URL.Query()
	if !checkTelegramAuthorization(params, common.TelegramBotToken) {
		c.JSON(200, gin.H{
			"message": "无效的请求",
			"success": false,
		})
		return
	}
	telegramId := params["id"][0]
	if model.IsTelegramIdAlreadyTaken(telegramId) {
		c.JSON(200, gin.H{
			"message": "该 Telegram 账户已被绑定",
			"success": false,
		})
		return
	}

	session := sessions.Default(c)
	id := session.Get("id")
	user := model.User{Id: id.(int)}
	if err := user.FillUserById(); err != nil {
		c.JSON(200, gin.H{
			"message": err.Error(),
			"success": false,
		})
		return
	}
	if user.Id == 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "用户已注销",
		})
		return
	}
	user.TelegramId = telegramId
	if err := user.Update(false); err != nil {
		c.JSON(200, gin.H{
			"message": err.Error(),
			"success": false,
		})
		return
	}

	c.Redirect(302, "/console/personal")
}

func TelegramLogin(c *gin.Context) {
	if !common.IsTelegramOAuthFlowEnabled() {
		c.JSON(200, gin.H{
			"message": "管理员未开启通过 Telegram 登录或注册",
			"success": false,
		})
		return
	}
	params := c.Request.URL.Query()
	if !checkTelegramAuthorization(params, common.TelegramBotToken) {
		c.JSON(200, gin.H{
			"message": "无效的请求",
			"success": false,
		})
		return
	}

	telegramId := params["id"][0]
	if model.IsTelegramIdAlreadyTaken(telegramId) {
		if !common.TelegramOAuthEnabled {
			c.JSON(http.StatusOK, gin.H{
				"message": "管理员未开启通过 Telegram 登录",
				"success": false,
			})
			return
		}

		user := model.User{TelegramId: telegramId}
		if err := user.FillUserByTelegramId(); err != nil {
			c.JSON(200, gin.H{
				"message": err.Error(),
				"success": false,
			})
			return
		}
		if user.Id == 0 {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "用户已注销",
			})
			return
		}
		if user.Status != common.UserStatusEnabled {
			c.JSON(http.StatusOK, gin.H{
				"message": "用户已被封禁",
				"success": false,
			})
			return
		}
		setupLogin(&user, c)
		return
	}

	if !common.RegisterEnabled || !common.IsTelegramOAuthRegisterEnabled() {
		c.JSON(http.StatusOK, gin.H{
			"message": "管理员未开启通过 Telegram 注册",
			"success": false,
		})
		return
	}

	inviterId, inviteErrorKey := resolveInviteRegistration(c, c.Query("aff"))
	if inviteErrorKey != "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": i18n.T(c, inviteErrorKey),
		})
		return
	}

	displayNameParts := []string{
		strings.TrimSpace(params.Get("first_name")),
		strings.TrimSpace(params.Get("last_name")),
	}
	displayName := strings.TrimSpace(strings.Join(displayNameParts, " "))
	if displayName == "" {
		displayName = strings.TrimSpace(params.Get("username"))
	}
	if displayName == "" {
		displayName = "Telegram User"
	}

	user := model.User{
		TelegramId:  telegramId,
		Username:    "telegram_" + strconv.Itoa(model.GetMaxUserId()+1),
		DisplayName: displayName,
		Role:        common.RoleCommonUser,
		Status:      common.UserStatusEnabled,
	}
	if err := user.Insert(inviterId, c.ClientIP()); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"message": err.Error(),
			"success": false,
		})
		return
	}
	setupLogin(&user, c)
}

func checkTelegramAuthorization(params map[string][]string, token string) bool {
	strs := []string{}
	var hash = ""
	for k, v := range params {
		if k == "hash" {
			hash = v[0]
			continue
		}
		strs = append(strs, k+"="+v[0])
	}
	sort.Strings(strs)
	var imploded = ""
	for _, s := range strs {
		if imploded != "" {
			imploded += "\n"
		}
		imploded += s
	}
	sha256hash := sha256.New()
	io.WriteString(sha256hash, token)
	hmachash := hmac.New(sha256.New, sha256hash.Sum(nil))
	io.WriteString(hmachash, imploded)
	ss := hex.EncodeToString(hmachash.Sum(nil))
	return hash == ss
}
