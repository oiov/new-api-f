package service

import (
	"bufio"
	"bytes"
	"context"
	"crypto/tls"
	"encoding/base64"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net/http"
	"net/mail"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gorilla/websocket"
	"golang.org/x/net/html"
	"golang.org/x/net/html/charset"
)

const (
	mailAssistantOutlookTokenURL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
	mailAssistantClientID        = "9e5f94bc-e8a4-4e73-b8be-63364c29d753"
	mailAssistantIMAPHost        = "outlook.office365.com:993"
	mailAssistantPollInterval    = 30 * time.Second
	mailAssistantFetchLimit      = 20
	mailAssistantMaxMessages     = 100
)

var mailAssistantLiteralPattern = regexp.MustCompile(`\{(\d+)\}\r?\n$`)

var (
	mailAssistantAutoReceiveOnce sync.Once
	mailAssistantRecovering      atomic.Bool
)

type MailAssistantImportRequest struct {
	Content string `json:"content"`
}

type MailAssistantMessage struct {
	ID          string `json:"id"`
	AccountID   string `json:"account_id"`
	Folder      string `json:"folder"`
	UID         uint32 `json:"uid"`
	Subject     string `json:"subject"`
	From        string `json:"from"`
	Date        string `json:"date"`
	Preview     string `json:"preview"`
	ReceivedAt  int64  `json:"received_at"`
	ReceivedAtS string `json:"received_at_s"`
}

type MailAssistantAccountView struct {
	ID             string                 `json:"id"`
	Email          string                 `json:"email"`
	ClientIP       string                 `json:"client_ip"`
	Status         string                 `json:"status"`
	AutoReceiving  bool                   `json:"auto_receiving"`
	LastError      string                 `json:"last_error"`
	LastSyncAt     int64                  `json:"last_sync_at"`
	LastSyncAtText string                 `json:"last_sync_at_text"`
	MessageCount   int                    `json:"message_count"`
	Messages       []MailAssistantMessage `json:"messages"`
}

type MailAssistantSnapshot struct {
	Accounts      []MailAssistantAccountView `json:"accounts"`
	AccountCount  int                        `json:"account_count"`
	MessageCount  int                        `json:"message_count"`
	UpdatedAt     int64                      `json:"updated_at"`
	UpdatedAtText string                     `json:"updated_at_text"`
}

type mailAssistantManager struct {
	mu       sync.RWMutex
	sessions map[int]*mailAssistantUserSession
	clients  map[int]map[*websocket.Conn]struct{}
	nextID   uint64
}

type mailAssistantUserSession struct {
	id       uint64
	userID   int
	cancel   context.CancelFunc
	accounts map[string]*mailAssistantTrackedAccount
}

type mailAssistantTrackedAccount struct {
	id         string
	userID     int
	dbID       int
	email      string
	refreshTok string
}

type mailAssistantTokenResponse struct {
	AccessToken string `json:"access_token"`
}

type mailAssistantAccountImport struct {
	email        string
	password     string
	clientIP     string
	refreshToken string
}

type mailAssistantFetchResult struct {
	messages []MailAssistantMessage
}

var MailAssistant = &mailAssistantManager{
	sessions: make(map[int]*mailAssistantUserSession),
	clients:  make(map[int]map[*websocket.Conn]struct{}),
}

func (m *mailAssistantManager) Import(userID int, content string) (*MailAssistantSnapshot, error) {
	records, err := parseMailAssistantImports(content)
	if err != nil {
		return nil, err
	}
	if len(records) == 0 {
		return nil, fmt.Errorf("请输入至少一条邮箱记录")
	}
	inputs := make([]model.MailAssistantAccountInput, 0, len(records))
	for _, record := range records {
		inputs = append(inputs, model.MailAssistantAccountInput{
			Email:        record.email,
			ClientIP:     record.clientIP,
			RefreshToken: record.refreshToken,
		})
	}
	if _, err = model.ReplaceUserMailAssistantAccounts(userID, inputs); err != nil {
		return nil, err
	}
	session, err := m.reloadSessionFromDB(userID)
	if err != nil {
		return nil, err
	}
	if session != nil {
		m.pullAll(context.Background(), session)
	}
	m.broadcastSnapshot(userID)
	return m.GetSnapshot(userID), nil
}

func (m *mailAssistantManager) GetSnapshot(userID int) *MailAssistantSnapshot {
	if _, err := m.ensureSession(userID); err != nil {
		return emptyMailAssistantSnapshot()
	}
	return buildMailAssistantSnapshot(userID)
}

func (m *mailAssistantManager) PullAll(userID int) (*MailAssistantSnapshot, error) {
	session, err := m.ensureSession(userID)
	if err != nil {
		return nil, err
	}
	if session != nil {
		m.pullAll(context.Background(), session)
	}
	m.broadcastSnapshot(userID)
	return m.GetSnapshot(userID), nil
}

func (m *mailAssistantManager) PullAccount(userID int, accountID string) (*MailAssistantSnapshot, error) {
	session, err := m.ensureSession(userID)
	if err != nil {
		return nil, err
	}
	accountDBID, err := strconv.Atoi(strings.TrimSpace(accountID))
	if err != nil || accountDBID <= 0 {
		return nil, fmt.Errorf("邮箱账号不存在")
	}
	account, err := model.GetMailAssistantAccountByID(userID, accountDBID)
	if err != nil {
		return nil, fmt.Errorf("邮箱账号不存在")
	}
	if session != nil {
		if tracked, ok := session.accounts[strconv.Itoa(accountDBID)]; ok {
			m.pullAccount(context.Background(), session, tracked)
		} else {
			m.pullAccount(context.Background(), nil, toMailAssistantTrackedAccount(account))
		}
	} else {
		m.pullAccount(context.Background(), nil, toMailAssistantTrackedAccount(account))
	}
	m.broadcastSnapshot(userID)
	return m.GetSnapshot(userID), nil
}

func (m *mailAssistantManager) RegisterWS(userID int, conn *websocket.Conn) {
	m.mu.Lock()
	if m.clients[userID] == nil {
		m.clients[userID] = make(map[*websocket.Conn]struct{})
	}
	m.clients[userID][conn] = struct{}{}
	m.mu.Unlock()
	snapshot := buildMailAssistantSnapshot(userID)

	_ = writeMailAssistantWS(conn, map[string]any{
		"type": "snapshot",
		"data": snapshot,
	})
}

func (m *mailAssistantManager) UnregisterWS(userID int, conn *websocket.Conn) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if userClients := m.clients[userID]; userClients != nil {
		delete(userClients, conn)
		if len(userClients) == 0 {
			delete(m.clients, userID)
		}
	}
}

func (m *mailAssistantManager) runAutoReceive(ctx context.Context, session *mailAssistantUserSession) {
	ticker := time.NewTicker(mailAssistantPollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.pullAll(ctx, session)
			m.broadcastSnapshot(session.userID)
		}
	}
}

func (m *mailAssistantManager) pullAll(ctx context.Context, session *mailAssistantUserSession) {
	m.mu.RLock()
	accounts := make([]*mailAssistantTrackedAccount, 0, len(session.accounts))
	for _, account := range session.accounts {
		accounts = append(accounts, account)
	}
	m.mu.RUnlock()

	for _, account := range accounts {
		m.pullAccount(ctx, session, account)
	}
}

func (m *mailAssistantManager) pullAccount(ctx context.Context, session *mailAssistantUserSession, account *mailAssistantTrackedAccount) {
	select {
	case <-ctx.Done():
		return
	default:
	}
	if session != nil && !m.isSessionCurrent(session.userID, session.id) {
		return
	}
	_ = model.UpdateMailAssistantAccountState(account.dbID, currentMailAssistantUserID(session, account), map[string]any{
		"status":     "收件中",
		"last_error": "",
	})

	accessToken, err := getMailAssistantAccessToken(ctx, account.refreshTok)
	if err != nil {
		_ = model.UpdateMailAssistantAccountState(account.dbID, currentMailAssistantUserID(session, account), map[string]any{
			"status":     "收件失败",
			"last_error": err.Error(),
		})
		return
	}

	fetched, fetchErr := fetchMailAssistantMessages(ctx, account.dbID, account.email, accessToken)
	if fetchErr != nil {
		_ = model.UpdateMailAssistantAccountState(account.dbID, currentMailAssistantUserID(session, account), map[string]any{
			"status":     "收件失败",
			"last_error": fetchErr.Error(),
		})
		return
	}
	select {
	case <-ctx.Done():
		return
	default:
	}
	if session != nil && !m.isSessionCurrent(session.userID, session.id) {
		return
	}
	rows := make([]*model.MailAssistantStoredMessage, 0)
	for _, result := range fetched {
		for _, item := range result.messages {
			rows = append(rows, &model.MailAssistantStoredMessage{
				UserId:     currentMailAssistantUserID(session, account),
				AccountId:  account.dbID,
				Folder:     item.Folder,
				UID:        int64(item.UID),
				Subject:    item.Subject,
				From:       item.From,
				Date:       item.Date,
				Preview:    item.Preview,
				ReceivedAt: item.ReceivedAt,
			})
		}
	}
	if err = model.UpsertMailAssistantMessages(rows); err != nil {
		_ = model.UpdateMailAssistantAccountState(account.dbID, currentMailAssistantUserID(session, account), map[string]any{
			"status":     "收件失败",
			"last_error": err.Error(),
		})
		return
	}
	if err = model.TrimMailAssistantMessagesByAccount(account.dbID, mailAssistantMaxMessages); err != nil {
		_ = model.UpdateMailAssistantAccountState(account.dbID, currentMailAssistantUserID(session, account), map[string]any{
			"status":     "收件失败",
			"last_error": err.Error(),
		})
		return
	}
	_ = model.UpdateMailAssistantAccountState(account.dbID, currentMailAssistantUserID(session, account), map[string]any{
		"status":       "实时收件中",
		"last_error":   "",
		"last_sync_at": time.Now().Unix(),
	})
}

func (m *mailAssistantManager) broadcastSnapshot(userID int) {
	m.mu.RLock()
	connections := make([]*websocket.Conn, 0, len(m.clients[userID]))
	for conn := range m.clients[userID] {
		connections = append(connections, conn)
	}
	m.mu.RUnlock()
	snapshot := buildMailAssistantSnapshot(userID)

	for _, conn := range connections {
		if err := writeMailAssistantWS(conn, map[string]any{
			"type": "snapshot",
			"data": snapshot,
		}); err != nil {
			m.UnregisterWS(userID, conn)
			_ = conn.Close()
		}
	}
}

func (m *mailAssistantManager) isSessionCurrent(userID int, sessionID uint64) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	session := m.sessions[userID]
	return session != nil && session.id == sessionID
}

func (m *mailAssistantManager) ensureSession(userID int) (*mailAssistantUserSession, error) {
	m.mu.RLock()
	session := m.sessions[userID]
	m.mu.RUnlock()
	if session != nil {
		return session, nil
	}
	return m.reloadSessionFromDB(userID)
}

func (m *mailAssistantManager) reloadSessionFromDB(userID int) (*mailAssistantUserSession, error) {
	accounts, err := model.ListUserAutoReceivingMailAssistantAccounts(userID)
	if err != nil {
		return nil, err
	}
	return m.replaceSession(userID, accounts), nil
}

func (m *mailAssistantManager) replaceSession(userID int, accounts []*model.MailAssistantAccount) *mailAssistantUserSession {
	m.mu.Lock()
	defer m.mu.Unlock()
	if existing := m.sessions[userID]; existing != nil && existing.cancel != nil {
		existing.cancel()
	}
	if len(accounts) == 0 {
		delete(m.sessions, userID)
		return nil
	}
	m.nextID++
	ctx, cancel := context.WithCancel(context.Background())
	session := &mailAssistantUserSession{
		id:       m.nextID,
		userID:   userID,
		cancel:   cancel,
		accounts: make(map[string]*mailAssistantTrackedAccount, len(accounts)),
	}
	for _, account := range accounts {
		tracked := toMailAssistantTrackedAccount(account)
		session.accounts[tracked.id] = tracked
	}
	m.sessions[userID] = session
	go m.runAutoReceive(ctx, session)
	return session
}

func toMailAssistantTrackedAccount(account *model.MailAssistantAccount) *mailAssistantTrackedAccount {
	return &mailAssistantTrackedAccount{
		id:         strconv.Itoa(account.Id),
		userID:     account.UserId,
		dbID:       account.Id,
		email:      account.Email,
		refreshTok: account.RefreshToken,
	}
}

func buildMailAssistantSnapshot(userID int) *MailAssistantSnapshot {
	accounts, err := model.ListUserMailAssistantAccounts(userID)
	if err != nil {
		return emptyMailAssistantSnapshot()
	}
	if len(accounts) == 0 {
		return emptyMailAssistantSnapshot()
	}
	views := make([]MailAssistantAccountView, 0, len(accounts))
	totalMessages := 0
	var updatedAt int64
	for _, account := range accounts {
		messageCount, countErr := model.CountMailAssistantMessagesByAccount(account.Id)
		if countErr != nil {
			messageCount = 0
		}
		messagesDB, msgErr := model.ListMailAssistantMessagesByAccount(account.Id, mailAssistantMaxMessages)
		if msgErr != nil {
			messagesDB = nil
		}
		messages := make([]MailAssistantMessage, 0, len(messagesDB))
		for _, item := range messagesDB {
			messages = append(messages, MailAssistantMessage{
				ID:          fmt.Sprintf("%d-%s-%d", account.Id, sanitizeMailAssistantID(item.Folder), item.UID),
				AccountID:   strconv.Itoa(account.Id),
				Folder:      item.Folder,
				UID:         uint32(item.UID),
				Subject:     item.Subject,
				From:        item.From,
				Date:        item.Date,
				Preview:     item.Preview,
				ReceivedAt:  item.ReceivedAt,
				ReceivedAtS: time.Unix(item.ReceivedAt, 0).Format(time.DateTime),
			})
		}
		totalMessages += int(messageCount)
		if account.UpdatedAt > updatedAt {
			updatedAt = account.UpdatedAt
		}
		view := MailAssistantAccountView{
			ID:             strconv.Itoa(account.Id),
			Email:          account.Email,
			ClientIP:       account.ClientIP,
			Status:         account.Status,
			AutoReceiving:  account.AutoReceiving,
			LastError:      account.LastError,
			LastSyncAt:     account.LastSyncAt,
			LastSyncAtText: "",
			MessageCount:   int(messageCount),
			Messages:       messages,
		}
		if account.LastSyncAt > 0 {
			view.LastSyncAtText = time.Unix(account.LastSyncAt, 0).Format(time.DateTime)
		}
		views = append(views, view)
	}
	sort.Slice(views, func(i, j int) bool {
		return views[i].Email < views[j].Email
	})
	if updatedAt <= 0 {
		updatedAt = time.Now().Unix()
	}
	return &MailAssistantSnapshot{
		Accounts:      views,
		AccountCount:  len(views),
		MessageCount:  totalMessages,
		UpdatedAt:     updatedAt,
		UpdatedAtText: time.Unix(updatedAt, 0).Format(time.DateTime),
	}
}

func emptyMailAssistantSnapshot() *MailAssistantSnapshot {
	now := time.Now()
	return &MailAssistantSnapshot{
		Accounts:      []MailAssistantAccountView{},
		AccountCount:  0,
		MessageCount:  0,
		UpdatedAt:     now.Unix(),
		UpdatedAtText: now.Format(time.DateTime),
	}
}

func currentMailAssistantUserID(session *mailAssistantUserSession, account *mailAssistantTrackedAccount) int {
	if session != nil {
		return session.userID
	}
	if account != nil {
		return account.userID
	}
	return 0
}

func StartMailAssistantAutoReceiveTask() {
	mailAssistantAutoReceiveOnce.Do(func() {
		if !common.IsMasterNode {
			return
		}
		go func() {
			if err := MailAssistant.RestoreAutoReceiveSessions(); err != nil {
				common.SysError("mail assistant auto receive restore failed: " + err.Error())
				return
			}
			common.SysLog("mail assistant auto receive restore finished")
		}()
	})
}

func (m *mailAssistantManager) RestoreAutoReceiveSessions() error {
	if !mailAssistantRecovering.CompareAndSwap(false, true) {
		return nil
	}
	defer mailAssistantRecovering.Store(false)

	if err := model.ClearMailAssistantPasswords(); err != nil {
		return err
	}
	userIDs, err := model.ListMailAssistantAutoReceivingUserIDs()
	if err != nil {
		return err
	}
	for _, userID := range userIDs {
		if userID <= 0 {
			continue
		}
		session, reloadErr := m.reloadSessionFromDB(userID)
		if reloadErr != nil {
			common.SysError(fmt.Sprintf("mail assistant restore session failed: user_id=%d err=%v", userID, reloadErr))
			continue
		}
		if session != nil {
			m.broadcastSnapshot(userID)
		}
	}
	return nil
}

func parseMailAssistantImports(content string) ([]mailAssistantAccountImport, error) {
	lines := strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n")
	result := make([]mailAssistantAccountImport, 0, len(lines))
	seen := make(map[string]struct{})

	for index, rawLine := range lines {
		line := strings.TrimSpace(rawLine)
		if line == "" {
			continue
		}
		parts := strings.Split(line, "----")
		if len(parts) != 4 {
			return nil, fmt.Errorf("第 %d 行格式错误，应为 邮箱----密码----客户端IP----refresh_token", index+1)
		}
		record := mailAssistantAccountImport{
			email:        strings.TrimSpace(parts[0]),
			password:     strings.TrimSpace(parts[1]),
			clientIP:     strings.TrimSpace(parts[2]),
			refreshToken: strings.TrimSpace(parts[3]),
		}
		if record.email == "" || record.refreshToken == "" {
			return nil, fmt.Errorf("第 %d 行缺少邮箱或 refresh_token", index+1)
		}
		if _, ok := seen[strings.ToLower(record.email)]; ok {
			continue
		}
		seen[strings.ToLower(record.email)] = struct{}{}
		result = append(result, record)
	}
	return result, nil
}

func getMailAssistantAccessToken(ctx context.Context, refreshToken string) (string, error) {
	form := make(urlValues)
	form.Set("grant_type", "refresh_token")
	form.Set("refresh_token", refreshToken)
	form.Set("client_id", mailAssistantClientID)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, mailAssistantOutlookTokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("刷新 access_token 失败: %s", strings.TrimSpace(string(body)))
	}

	var tokenResp mailAssistantTokenResponse
	if err = common.Unmarshal(body, &tokenResp); err != nil {
		return "", err
	}
	if tokenResp.AccessToken == "" {
		return "", fmt.Errorf("未获取到 access_token")
	}
	return tokenResp.AccessToken, nil
}

func fetchMailAssistantMessages(ctx context.Context, accountID int, emailAddress, accessToken string) (map[string]mailAssistantFetchResult, error) {
	client, err := newMailAssistantIMAPClient(mailAssistantIMAPHost)
	if err != nil {
		return nil, err
	}
	defer client.Close()

	if err = client.AuthenticateXOAUTH2(emailAddress, accessToken); err != nil {
		return nil, err
	}
	defer client.Logout()

	folders := []string{"INBOX", "Junk", "Junk Email"}
	results := make(map[string]mailAssistantFetchResult)
	seenFolder := make(map[string]struct{})

	for _, folder := range folders {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}
		if _, ok := seenFolder[folder]; ok {
			continue
		}
		seenFolder[folder] = struct{}{}

		if err = client.Select(folder); err != nil {
			continue
		}
		maxUID, maxErr := model.GetMailAssistantMaxUIDByFolder(accountID, folder)
		if maxErr != nil {
			continue
		}
		uids, searchErr := client.SearchUIDs(uint32(maxUID + 1))
		if searchErr != nil {
			continue
		}
		if len(uids) == 0 {
			if maxUID == 0 {
				uids, _ = client.SearchUIDs(1)
			}
			if len(uids) == 0 {
				continue
			}
		}
		if len(uids) > mailAssistantFetchLimit {
			uids = uids[len(uids)-mailAssistantFetchLimit:]
		}
		var folderMessages []MailAssistantMessage
		for _, uid := range uids {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			default:
			}
			raw, fetchErr := client.FetchMessage(uid)
			if fetchErr != nil {
				continue
			}
			message, parseErr := parseMailAssistantMessage(emailAddress, folder, uid, raw)
			if parseErr != nil {
				continue
			}
			folderMessages = append(folderMessages, message)
		}
		results[folder] = mailAssistantFetchResult{
			messages: folderMessages,
		}
	}

	return results, nil
}

func parseMailAssistantMessage(accountEmail, folder string, uid uint32, raw []byte) (MailAssistantMessage, error) {
	msg, err := mail.ReadMessage(bytes.NewReader(raw))
	if err != nil {
		return MailAssistantMessage{}, err
	}

	subject := decodeMailAssistantHeader(msg.Header.Get("Subject"))
	if subject == "" {
		subject = "(无主题)"
	}
	from := decodeMailAssistantHeader(msg.Header.Get("From"))
	dateRaw := decodeMailAssistantHeader(msg.Header.Get("Date"))
	receivedAt := time.Now()
	if parsedTime, parseErr := mail.ParseDate(dateRaw); parseErr == nil {
		receivedAt = parsedTime
	}
	bodyBytes, err := io.ReadAll(msg.Body)
	if err != nil {
		return MailAssistantMessage{}, err
	}
	preview := extractMailAssistantBodyPreview(msg.Header, bodyBytes)

	return MailAssistantMessage{
		ID:          fmt.Sprintf("%s-%s-%d", sanitizeMailAssistantID(accountEmail), sanitizeMailAssistantID(folder), uid),
		AccountID:   sanitizeMailAssistantID(accountEmail),
		Folder:      folder,
		UID:         uid,
		Subject:     subject,
		From:        from,
		Date:        dateRaw,
		Preview:     preview,
		ReceivedAt:  receivedAt.Unix(),
		ReceivedAtS: receivedAt.Format(time.DateTime),
	}, nil
}

func decodeMailAssistantHeader(value string) string {
	if value == "" {
		return ""
	}
	decoder := mime.WordDecoder{}
	decoded, err := decoder.DecodeHeader(value)
	if err != nil {
		return value
	}
	return decoded
}

func extractMailAssistantBodyPreview(header mail.Header, body []byte) string {
	contentType := header.Get("Content-Type")
	mediaType, params, _ := mime.ParseMediaType(contentType)
	if strings.HasPrefix(mediaType, "multipart/") {
		boundary := params["boundary"]
		if boundary != "" {
			reader := multipart.NewReader(bytes.NewReader(body), boundary)
			var htmlBody string
			for {
				part, err := reader.NextPart()
				if err == io.EOF {
					break
				}
				if err != nil {
					break
				}
				partBody, readErr := io.ReadAll(part)
				_ = part.Close()
				if readErr != nil {
					continue
				}
				partType, _, _ := mime.ParseMediaType(part.Header.Get("Content-Type"))
				decodedPartBody := decodeMailAssistantBody(part.Header, partBody)
				switch partType {
				case "text/plain":
					text := normalizeMailAssistantWhitespace(string(decodedPartBody))
					if text != "" {
						return truncateMailAssistantPreview(text)
					}
				case "text/html":
					htmlBody = stripMailAssistantHTML(string(decodedPartBody))
				}
			}
			return truncateMailAssistantPreview(normalizeMailAssistantWhitespace(htmlBody))
		}
	}
	decodedBody := decodeMailAssistantBody(header, body)
	if mediaType == "text/html" {
		return truncateMailAssistantPreview(normalizeMailAssistantWhitespace(stripMailAssistantHTML(string(decodedBody))))
	}
	return truncateMailAssistantPreview(normalizeMailAssistantWhitespace(string(decodedBody)))
}

func decodeMailAssistantBody(header textprotoMIMEHeader, body []byte) []byte {
	decoded := body
	switch strings.ToLower(strings.TrimSpace(header.Get("Content-Transfer-Encoding"))) {
	case "base64":
		if reader := base64.NewDecoder(base64.StdEncoding, bytes.NewReader(body)); reader != nil {
			if data, err := io.ReadAll(reader); err == nil {
				decoded = data
			}
		}
	case "quoted-printable":
		if data, err := io.ReadAll(quotedprintable.NewReader(bytes.NewReader(body))); err == nil {
			decoded = data
		}
	}

	contentType := header.Get("Content-Type")
	_, params, _ := mime.ParseMediaType(contentType)
	charsetName := strings.TrimSpace(params["charset"])
	if charsetName == "" {
		return decoded
	}
	reader, err := charset.NewReaderLabel(charsetName, bytes.NewReader(decoded))
	if err != nil {
		return decoded
	}
	data, err := io.ReadAll(reader)
	if err != nil {
		return decoded
	}
	return data
}

func stripMailAssistantHTML(content string) string {
	doc, err := html.Parse(strings.NewReader(content))
	if err != nil {
		return content
	}
	var builder strings.Builder
	var walk func(*html.Node)
	walk = func(node *html.Node) {
		if node.Type == html.TextNode {
			builder.WriteString(node.Data)
			builder.WriteString(" ")
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(doc)
	return builder.String()
}

func normalizeMailAssistantWhitespace(content string) string {
	content = strings.ReplaceAll(content, "\u00a0", " ")
	lines := strings.Split(content, "\n")
	filtered := make([]string, 0, len(lines))
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" {
			filtered = append(filtered, trimmed)
		}
	}
	return strings.Join(filtered, "\n")
}

func truncateMailAssistantPreview(content string) string {
	if content == "" {
		return ""
	}
	runes := []rune(content)
	if len(runes) <= 200 {
		return content
	}
	return string(runes[:200]) + "..."
}

func sanitizeMailAssistantID(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	value = strings.ReplaceAll(value, "@", "-at-")
	value = strings.ReplaceAll(value, ".", "-")
	value = strings.ReplaceAll(value, " ", "-")
	return value
}

func writeMailAssistantWS(conn *websocket.Conn, payload any) error {
	data, err := common.Marshal(payload)
	if err != nil {
		return err
	}
	return conn.WriteMessage(websocket.TextMessage, data)
}

type textprotoMIMEHeader interface {
	Get(string) string
}

type urlValues = url.Values

type mailAssistantIMAPClient struct {
	conn   *tls.Conn
	reader *bufio.Reader
	writer *bufio.Writer
	tagNum int
}

func newMailAssistantIMAPClient(addr string) (*mailAssistantIMAPClient, error) {
	conn, err := tls.Dial("tcp", addr, &tls.Config{
		ServerName: strings.Split(addr, ":")[0],
		MinVersion: tls.VersionTLS12,
	})
	if err != nil {
		return nil, err
	}
	client := &mailAssistantIMAPClient{
		conn:   conn,
		reader: bufio.NewReader(conn),
		writer: bufio.NewWriter(conn),
	}
	if _, err = client.reader.ReadString('\n'); err != nil {
		_ = conn.Close()
		return nil, err
	}
	return client, nil
}

func (c *mailAssistantIMAPClient) Close() error {
	return c.conn.Close()
}

func (c *mailAssistantIMAPClient) nextTag() string {
	c.tagNum++
	return fmt.Sprintf("A%04d", c.tagNum)
}

func (c *mailAssistantIMAPClient) AuthenticateXOAUTH2(emailAddress, accessToken string) error {
	tag := c.nextTag()
	if _, err := c.writer.WriteString(tag + " AUTHENTICATE XOAUTH2\r\n"); err != nil {
		return err
	}
	if err := c.writer.Flush(); err != nil {
		return err
	}

	for {
		line, err := c.reader.ReadString('\n')
		if err != nil {
			return err
		}
		if strings.HasPrefix(line, "+") {
			authString := fmt.Sprintf("user=%s\x01auth=Bearer %s\x01\x01", emailAddress, accessToken)
			if _, err = c.writer.WriteString(base64.StdEncoding.EncodeToString([]byte(authString)) + "\r\n"); err != nil {
				return err
			}
			if err = c.writer.Flush(); err != nil {
				return err
			}
			break
		}
		if strings.HasPrefix(line, tag+" ") {
			return fmt.Errorf("IMAP 认证失败: %s", strings.TrimSpace(line))
		}
	}

	lines, _, err := c.executeWithTag(tag, "")
	if err != nil {
		return err
	}
	if len(lines) == 0 {
		return fmt.Errorf("IMAP 认证失败")
	}
	return nil
}

func (c *mailAssistantIMAPClient) Select(folder string) error {
	_, _, err := c.execute(fmt.Sprintf("SELECT %s", quoteMailAssistantIMAPString(folder)))
	return err
}

func (c *mailAssistantIMAPClient) SearchUIDs(startUID uint32) ([]uint32, error) {
	lines, _, err := c.execute(fmt.Sprintf("UID SEARCH UID %d:*", startUID))
	if err != nil {
		return nil, err
	}
	var result []uint32
	for _, line := range lines {
		if !strings.HasPrefix(line, "* SEARCH") {
			continue
		}
		fields := strings.Fields(strings.TrimSpace(strings.TrimPrefix(line, "* SEARCH")))
		for _, field := range fields {
			uid64, parseErr := strconv.ParseUint(field, 10, 32)
			if parseErr == nil {
				result = append(result, uint32(uid64))
			}
		}
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i] < result[j]
	})
	return result, nil
}

func (c *mailAssistantIMAPClient) FetchMessage(uid uint32) ([]byte, error) {
	lines, literals, err := c.execute(fmt.Sprintf("UID FETCH %d (BODY.PEEK[])", uid))
	if err != nil {
		return nil, err
	}
	if len(literals) == 0 {
		return nil, fmt.Errorf("未读取到邮件正文: %v", lines)
	}
	return literals[0], nil
}

func (c *mailAssistantIMAPClient) Logout() error {
	_, _, err := c.execute("LOGOUT")
	return err
}

func (c *mailAssistantIMAPClient) execute(command string) ([]string, [][]byte, error) {
	tag := c.nextTag()
	return c.executeWithTag(tag, command)
}

func (c *mailAssistantIMAPClient) executeWithTag(tag, command string) ([]string, [][]byte, error) {
	if command != "" {
		if _, err := c.writer.WriteString(tag + " " + command + "\r\n"); err != nil {
			return nil, nil, err
		}
		if err := c.writer.Flush(); err != nil {
			return nil, nil, err
		}
	}

	lines := make([]string, 0, 8)
	literals := make([][]byte, 0, 1)
	for {
		line, err := c.reader.ReadString('\n')
		if err != nil {
			return nil, nil, err
		}
		lines = append(lines, strings.TrimRight(line, "\r\n"))
		if literalSize := parseMailAssistantLiteralSize(line); literalSize > 0 {
			buf := make([]byte, literalSize)
			if _, err = io.ReadFull(c.reader, buf); err != nil {
				return nil, nil, err
			}
			literals = append(literals, buf)
		}
		if strings.HasPrefix(line, tag+" ") {
			upperLine := strings.ToUpper(line)
			if strings.Contains(upperLine, " OK") {
				return lines, literals, nil
			}
			return lines, literals, fmt.Errorf("IMAP 命令失败: %s", strings.TrimSpace(line))
		}
	}
}

func parseMailAssistantLiteralSize(line string) int {
	matches := mailAssistantLiteralPattern.FindStringSubmatch(line)
	if len(matches) != 2 {
		return 0
	}
	value, err := strconv.Atoi(matches[1])
	if err != nil {
		return 0
	}
	return value
}

func quoteMailAssistantIMAPString(value string) string {
	value = strings.ReplaceAll(value, `\`, `\\`)
	value = strings.ReplaceAll(value, `"`, `\"`)
	return `"` + value + `"`
}
