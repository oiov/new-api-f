package common

import (
	"bytes"
	"crypto/tls"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"net/smtp"
	"regexp"
	"slices"
	"strings"
	"time"
)

type emailAddressPayload struct {
	Name    string `json:"name,omitempty"`
	Address string `json:"address"`
}

type cloudflareEmailWorkerRequest struct {
	From    emailAddressPayload `json:"from"`
	To      emailAddressPayload `json:"to"`
	Subject string              `json:"subject"`
	Text    string              `json:"text,omitempty"`
	HTML    string              `json:"html,omitempty"`
}

type cloudflareEmailWorkerResponse struct {
	Success bool   `json:"success,omitempty"`
	Error   string `json:"error,omitempty"`
}

func generateMessageID() (string, error) {
	split := strings.Split(SMTPFrom, "@")
	if len(split) < 2 {
		return "", fmt.Errorf("invalid SMTP account")
	}
	domain := strings.Split(SMTPFrom, "@")[1]
	return fmt.Sprintf("<%d.%s@%s>", time.Now().UnixNano(), GetRandomString(12), domain), nil
}

func SendEmail(subject string, receiver string, content string) error {
	if EmailSenderType == EmailSenderTypeCloudflareWorker {
		return sendEmailByCloudflareWorker(subject, receiver, content)
	}
	return sendEmailBySMTP(subject, receiver, content)
}

func sendEmailBySMTP(subject string, receiver string, content string) error {
	if SMTPFrom == "" { // for compatibility
		SMTPFrom = SMTPAccount
	}
	id, err2 := generateMessageID()
	if err2 != nil {
		return err2
	}
	if SMTPServer == "" && SMTPAccount == "" {
		return fmt.Errorf("SMTP 服务器未配置")
	}
	encodedSubject := fmt.Sprintf("=?UTF-8?B?%s?=", base64.StdEncoding.EncodeToString([]byte(subject)))
	mail := []byte(fmt.Sprintf("To: %s\r\n"+
		"From: %s <%s>\r\n"+
		"Subject: %s\r\n"+
		"Date: %s\r\n"+
		"Message-ID: %s\r\n"+ // 添加 Message-ID 头
		"Content-Type: text/html; charset=UTF-8\r\n\r\n%s\r\n",
		receiver, SystemName, SMTPFrom, encodedSubject, time.Now().Format(time.RFC1123Z), id, content))
	auth := smtp.PlainAuth("", SMTPAccount, SMTPToken, SMTPServer)
	addr := fmt.Sprintf("%s:%d", SMTPServer, SMTPPort)
	to := strings.Split(receiver, ";")
	var err error
	if SMTPPort == 465 || SMTPSSLEnabled {
		tlsConfig := &tls.Config{
			InsecureSkipVerify: true,
			ServerName:         SMTPServer,
		}
		conn, err := tls.Dial("tcp", fmt.Sprintf("%s:%d", SMTPServer, SMTPPort), tlsConfig)
		if err != nil {
			return err
		}
		client, err := smtp.NewClient(conn, SMTPServer)
		if err != nil {
			return err
		}
		defer client.Close()
		if err = client.Auth(auth); err != nil {
			return err
		}
		if err = client.Mail(SMTPFrom); err != nil {
			return err
		}
		receiverEmails := strings.Split(receiver, ";")
		for _, receiver := range receiverEmails {
			if err = client.Rcpt(receiver); err != nil {
				return err
			}
		}
		w, err := client.Data()
		if err != nil {
			return err
		}
		_, err = w.Write(mail)
		if err != nil {
			return err
		}
		err = w.Close()
		if err != nil {
			return err
		}
	} else if isOutlookServer(SMTPAccount) || slices.Contains(EmailLoginAuthServerList, SMTPServer) {
		auth = LoginAuth(SMTPAccount, SMTPToken)
		err = smtp.SendMail(addr, auth, SMTPFrom, to, mail)
	} else {
		err = smtp.SendMail(addr, auth, SMTPFrom, to, mail)
	}
	if err != nil {
		SysError(fmt.Sprintf("failed to send email to %s: %v", receiver, err))
	}
	return err
}

func sendEmailByCloudflareWorker(subject string, receiver string, content string) error {
	workerURL := normalizeCloudflareEmailWorkerSendURL(CloudflareEmailWorkerURL)
	if workerURL == "" {
		return fmt.Errorf("Cloudflare Worker 邮件发送地址未配置")
	}
	token := strings.TrimSpace(CloudflareEmailWorkerToken)
	if token == "" {
		return fmt.Errorf("Cloudflare Worker 邮件发送密钥未配置")
	}

	fromAddress := strings.TrimSpace(CloudflareEmailWorkerFromAddress)
	if fromAddress == "" {
		fromAddress = DefaultCloudflareEmailWorkerFromAddress
	}
	fromName := strings.TrimSpace(CloudflareEmailWorkerFromName)
	if fromName == "" {
		fromName = SystemName
	}

	receivers := strings.Split(receiver, ";")
	var lastErr error
	for _, receiverAddress := range receivers {
		receiverAddress = strings.TrimSpace(receiverAddress)
		if receiverAddress == "" {
			continue
		}
		payload := cloudflareEmailWorkerRequest{
			From: emailAddressPayload{
				Name:    fromName,
				Address: fromAddress,
			},
			To: emailAddressPayload{
				Address: receiverAddress,
			},
			Subject: subject,
			Text:    htmlToPlainTextEmail(content),
			HTML:    content,
		}
		if err := postCloudflareEmailWorker(workerURL, token, payload); err != nil {
			SysError(fmt.Sprintf("failed to send email to %s by cloudflare worker: %v", receiverAddress, err))
			lastErr = err
		}
	}
	return lastErr
}

func normalizeCloudflareEmailWorkerSendURL(rawURL string) string {
	workerURL := strings.TrimRight(strings.TrimSpace(rawURL), "/")
	if workerURL == "" {
		return ""
	}
	if !strings.HasPrefix(workerURL, "http://") && !strings.HasPrefix(workerURL, "https://") {
		workerURL = "https://" + workerURL
	}
	return workerURL + "/send"
}

func postCloudflareEmailWorker(url string, token string, payload cloudflareEmailWorkerRequest) error {
	body, err := Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	responseBody, err := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if err != nil {
		return err
	}
	var workerResp cloudflareEmailWorkerResponse
	if err = Unmarshal(responseBody, &workerResp); err != nil {
		if resp.StatusCode >= http.StatusBadRequest {
			bodyText := strings.TrimSpace(string(responseBody))
			if bodyText != "" {
				return fmt.Errorf("Cloudflare Worker 邮件发送失败，HTTP 状态码: %d, 响应: %s", resp.StatusCode, bodyText)
			}
			return fmt.Errorf("Cloudflare Worker 邮件发送失败，HTTP 状态码: %d", resp.StatusCode)
		}
		return err
	}
	if resp.StatusCode >= http.StatusBadRequest || !workerResp.Success {
		if workerResp.Error != "" {
			return fmt.Errorf("Cloudflare Worker 邮件发送失败: %s", workerResp.Error)
		}
		return fmt.Errorf("Cloudflare Worker 邮件发送失败，HTTP 状态码: %d", resp.StatusCode)
	}
	return nil
}

func htmlToPlainTextEmail(content string) string {
	replacements := []struct {
		old string
		new string
	}{
		{"</p>", "\n"},
		{"</div>", "\n"},
		{"</tr>", "\n"},
		{"<br>", "\n"},
		{"<br/>", "\n"},
		{"<br />", "\n"},
		{"</li>", "\n"},
	}
	text := content
	for _, replacement := range replacements {
		text = strings.ReplaceAll(text, replacement.old, replacement.new)
		text = strings.ReplaceAll(text, strings.ToUpper(replacement.old), replacement.new)
	}

	tagPattern := regexp.MustCompile(`<[^>]+>`)
	text = tagPattern.ReplaceAllString(text, "")
	text = strings.NewReplacer(
		"&nbsp;", " ",
		"&amp;", "&",
		"&lt;", "<",
		"&gt;", ">",
		"&quot;", "\"",
		"&#39;", "'",
	).Replace(text)
	lines := strings.Split(text, "\n")
	compactLines := make([]string, 0, len(lines))
	for _, line := range lines {
		line = strings.Join(strings.Fields(line), " ")
		if line != "" {
			compactLines = append(compactLines, line)
		}
	}
	return strings.Join(compactLines, "\n")
}
