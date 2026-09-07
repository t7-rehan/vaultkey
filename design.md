**VaultKey — Frontend Design Specification**

**1\. Project Overview**  
VaultKey is a decentralized secure file-sharing platform designed to give users control over sensitive files even after they have been shared.  
The frontend should make advanced security features feel simple and convenient. Users should be able to upload, encrypt, configure, share, monitor, and revoke files through a clean and intuitive interface.

**2\. Theme**

* Core Visual Identity

VaultKey should have a modern, premium, cybersecurity-focused appearance.

* Color Palette  
1. Primary Background: \`\#080D18\`  
2. Secondary Background: \`\#0F1827\`  
3. Primary Accent: Blue / electric blue tones  
4. Success States: Green  
5. Warning States: Amber  
6. Danger / Revoke States: Red  
7. Text: White and muted blue-grey  
     
* Design Style  
1. Dark mode by default  
2. Minimal and uncluttered interface  
3. Subtle gradients and glow effects  
4. Rounded cards and buttons  
5. Clean security-oriented icons  
6. Smooth micro-interactions and transitions  
     
* Typography

Use a clean, modern sans-serif font such as:

1. Inter  
2. Manrope  
3. Plus Jakarta Sans

The interface should prioritize readability and a professional appearance.

**3\. AI / ML Component**  
AI is an optional enhancement rather than the core functionality of VaultKey.

* AI-Powered Security Monitoring

The system can analyze file access patterns and identify potentially suspicious activity.  
Examples include:

1. Access from an unusual location  
2. Access from a previously unseen device  
3. Multiple failed password attempts  
4. Unusually frequent access attempts  
5. Suspicious time patterns  
6. Frontend AI Features

The dashboard can display:

1. Security Alerts  
2. Suspicious Activity Flags  
3. Risk Level Indicators

**4\. Tech Stack**

* Frontend  
1. React — User interface development  
2. Tailwind CSS — Styling and responsive design  
3. Web Crypto API — Client-side encryption and cryptographic operations  
4. Recommended Supporting Libraries  
5. Framer Motion — Animations and transitions  
6.  Sonner — Success and error notifications  
   

The frontend will communicate with:

1. FastAPI — Backend API  
2. PostgreSQL — User and metadata storage  
   

**5\. Frontend Pages and Design**

* Landing Page

The landing page should clearly communicate the purpose of VaultKey.  
Main sections:

1. Hero section  
2. Secure file-sharing explanation  
3. Key security features  
4. How VaultKey works  
5. Call-to-action buttons

Example headline:  
***Share files. Keep control.***  
Primary buttons:

1. Upload Securely

\---

* Authentication Pages

Pages for:

1. Login  
2. Create Account  
3. Forgot Password

Design should be simple, minimal, and security-focused.  
\---

* User Dashboard

The main dashboard should provide a quick overview of the user's shared files.  
Dashboard sections:

1. Recent Files  
2. Active Shares  
3. Expired Files  
4. Revoked Links  
5. Security Alerts

Each file card should display:

1. File name  
2. File type  
3. Creation date  
4. Expiry status  
5. Access count  
6. Security status

\---

* Secure File Upload Page

Features:

1. Drag-and-drop upload area  
2. File selection button  
3. Encryption progress indicator  
4. Upload progress indicator  
5. File details preview  
     
1. Suggested flow:

Select File → Encrypt Locally → Upload Encrypted File → Configure Security → Generate Link

Share Configuration Page Users should be able to configure:

1. Expiry date and time  
2. One-time access  
3. Password protection  
4. Maximum access attempts  
5. Optional download restrictions

   

Provide quick presets such as:

1. ⚡ Quick Share — 24-hour expiry  
2. 🔒 Sensitive — Password \+ 1-hour expiry  
3. 💣 Self-Destruct — One-time access  
4. 🏢 Work — Longer expiry \+ audit logging

Generated Link Page After a file is uploaded, display:

* Secure share link  
* Copy Link button  
* QR code  
* Link expiry  
* Security settings summary

Example notification:  
 ***✓ Secure link copied\!***

* File Access Page

This page is used by the recipient.

- [ ] Possible states:  
1. Active file  
2. Password required  
3. Expired  
4. Revoked  
5. Already accessed

For one-time links, after successful access, display:  
 ***\*\*ACCESS CONSUMED\*\****  
 ***This secure link is no longer available.***

A subtle self-destruct or burn animation can be used to improve the experience.

1. Access Audit Log  
2. Display a chronological list of file access events.

Information can include:

1. Access time  
2. Device  
3. Browser  
4. Approximate location  
5. Access status  
6. Failed attempts

   

   

**6\. Core Features**

* File Management  
* Drag-and-drop upload  
* File encryption progress  
* Upload progress  
* Recent files  
* Share history  
* Secure Sharing  
* Time-limited links  
* One-time access links  
* Password protection  
* Custom expiry settings  
* Access Control  
* Remote access revocation  
* Automatic link expiry  
* Access status tracking  
* One-click copy link  
* QR code generation  
* Recent file access  
* Clear status indicators  
* Notifications

Notify users about:

* Successful uploads  
* Link creation  
* File access  
* Link expiry  
* Failed access attempts  
* Suspicious activity


  
**7\. Security-Focused UI Elements**  
The interface should visually communicate trust and security.  
Include:

* Encryption indicators  
* Lock icons  
* Security badges  
* Active / expired / revoked status chips  
* Risk indicators

Example status labels:

* 🟢 Active  
* 🟡 Expiring Soon  
* 🔴 Revoked  
* ⚫ Expired  
* 🔥 Access Consumed

**8\. Responsive Design**  
VaultKey should work smoothly across:

* Desktop  
* Mobile Priorities  
* Easy file upload  
* Quick sharing  
* QR code access  
* Simple access monitoring  
* One-tap revocation

**9\. Recommended MVP Features**  
For a fast and effective MVP, prioritize:

* User authentication  
* Drag-and-drop file upload  
* Client-side encryption  
* Encryption/upload progress  
* Secure link generation  
* Expiry settings  
* One-time access  
* Password protection  
* Copy link  
* QR code sharing  
* Access log  
* Remote revoke  
* Expired and consumed link states  
    
    
    
    
    
    
  


**10\. Future Frontend Enhancements**  
Possible future additions include:

* End-to-end encrypted team workspaces  
* Folder sharing  
* Multiple recipients  
* Advanced analytics  
* Enterprise dashboard  
* AI-powered anomaly detection  
* Integration with enterprise DLP systems  
* Browser extension  
* Progressive Web App (PWA)  
* AI Security Insights

Example:  
⚠ Unusual access attempt detected from a new device.

* Security Score

Each shared file can optionally receive a visual security score based on its configuration.  
Example:

1. Security Score: 95/100  
2. The score can consider:  
3. Password protection  
4. One-time access  
5. Link expiry duration  
6. Number of access attempts  
   

**Final Design Goal**

VaultKey should feel like a combination of a modern cloud storage platform and a cybersecurity tool.  
The key design principle is:

Complex security in the background. Simple sharing in the foreground.\*\*  
The user should be able to securely share a sensitive file in just a few steps while still maintaining complete control over its access.  
