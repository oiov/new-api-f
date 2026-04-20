import requests
import imaplib
import email
from bs4 import BeautifulSoup
from email.header import decode_header
import chardet


def get_new_access_token(refresh_token):
    # 刷新新的access_token
    client_id = '9e5f94bc-e8a4-4e73-b8be-63364c29d753'
    tenant_id = 'common'
    nineemail = 'https://www.nineemail.com/'
    refresh_token_data = {
        'grant_type': 'refresh_token',
        'refresh_token': refresh_token,
        'client_id': client_id,
    }

    token_url = f"https://login.microsoftonline.com/{
        tenant_id}/oauth2/v2.0/token"
    response = requests.post(token_url, data=refresh_token_data)
    if response.status_code == 200:
        new_access_token = response.json().get('access_token')
        print(f"New Access Token: {new_access_token}")
        return new_access_token
    else:
        print(f"Error: {response.status_code} - {response.text}")

# 生成 OAuth2 授权字符串


def generate_auth_string(user, token):
    return f"user={user}\1auth=Bearer {token}\1\1"

# 解码邮件标题


def decode_mime_words(s):
    decoded_fragments = decode_header(s)
    return ''.join([str(t[0], t[1] or 'utf-8') if isinstance(t[0], bytes) else t[0] for t in decoded_fragments])

# 去除 HTML 标签


def strip_html(content):
    soup = BeautifulSoup(content, "html.parser")
    return soup.get_text()

# 自动检测并解码字节数据


def safe_decode(byte_content):
    result = chardet.detect(byte_content)
    encoding = result['encoding']
    if encoding is not None:
        return byte_content.decode(encoding)
    else:
        return byte_content.decode('utf-8', errors='ignore')

# 去除多余空行


def remove_extra_blank_lines(text):
    lines = text.splitlines()
    # 使用 filter 删除空行，保留非空行
    return "\n".join(filter(lambda line: line.strip(), lines))

# 打印指定文件夹中的邮件


def print_folder_emails(mail, folder_name):
    status, messages = mail.select(folder_name)
    if status != "OK":
        print(f"选择 {folder_name} 失败: {status}")
        return

    status, message_ids = mail.search(None, 'ALL')
    if status != "OK":
        print(f"邮件搜索失败: {status}")
        return
    email_counter = 1

    # 获取每封邮件
    for message_id in message_ids[0].split():
        status, msg_data = mail.fetch(message_id, '(RFC822)')
        if status != "OK":
            print(f"获取邮件失败: {status}")
            continue

        for response_part in msg_data:
            if isinstance(response_part, tuple):
                msg = email.message_from_bytes(response_part[1])
                subject = decode_mime_words(msg["subject"])
                date = msg["date"]
                body = ""
                if msg.is_multipart():
                    for part in msg.walk():
                        content_type = part.get_content_type()
                        content_disposition = str(
                            part.get("Content-Disposition"))

                        if "attachment" not in content_disposition:
                            if content_type == "text/plain":
                                body += safe_decode(part.get_payload(decode=True))
                            elif content_type == "text/html":
                                html_content = safe_decode(
                                    part.get_payload(decode=True))
                                body += strip_html(html_content)  # 去除 HTML 元素
                else:
                    if msg.get_content_type() == "text/plain":
                        body = safe_decode(msg.get_payload(decode=True))
                    elif msg.get_content_type() == "text/html":
                        html_content = safe_decode(
                            msg.get_payload(decode=True))
                        body = strip_html(html_content)  # 去除 HTML 元素

                body = remove_extra_blank_lines(body)
                print(f"\n--- 文件夹: {folder_name} ---")
                print(f"邮件编号: {email_counter}")
                print(f"邮件主题: {subject}")
                print(f"收件时间: {date}")
                print(f"邮件正文:\n{body.strip()}\n")
                print("-" * 50)
                email_counter += 1

# 连接并获取收件箱和垃圾箱中的邮件


def get_imap(access_token, email_address):
    try:
        nineemail = 'https://www.nineemail.com/'
        mail = imaplib.IMAP4_SSL('outlook.office365.com')
        auth_string = generate_auth_string(email_address, access_token)
        mail.authenticate('XOAUTH2', lambda x: auth_string)
        print_folder_emails(mail, "INBOX")
        print_folder_emails(mail, "Junk")  # 一般是 "Junk" 或 "Junk Email"
        mail.logout()
    except imaplib.IMAP4.error as e:
        print(f"IMAP 认证失败: {e}")


refresh_token = 'www.nineemail.com'  # 替换为你的refresh_token
access_token = get_new_access_token(refresh_token)
email_address = "nineemail@hotmail.com"  # 替换为你的邮箱地址

get_imap(access_token, email_address)
