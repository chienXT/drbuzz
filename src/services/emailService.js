'use strict';

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Gửi mã xác minh reset password
 */
const sendResetCode = async (email, code) => {
  const mailOptions = {
    from: `"DramaBuzz" <${process.env.SMTP_USER || 'noreply@dramabuzz.com'}>`,
    to: email,
    subject: 'Mã xác minh đặt lại mật khẩu – DramaBuzz',
    html: `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f9f9f9;border-radius:12px">
        <h2 style="color:#1a1a2e;margin:0 0 8px">🔥 DramaBuzz</h2>
        <p style="color:#555;margin:0 0 24px">Đặt lại mật khẩu của bạn</p>
        <div style="background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:24px;text-align:center">
          <p style="color:#333;margin:0 0 16px">Mã xác minh của bạn là:</p>
          <div style="font-size:32px;font-weight:800;letter-spacing:8px;color:#4466ff;margin:0 0 16px">${code}</div>
          <p style="color:#888;font-size:13px;margin:0">Mã có hiệu lực trong <strong>10 phút</strong>.</p>
        </div>
        <p style="color:#999;font-size:12px;margin:24px 0 0;text-align:center">
          Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.
        </p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

module.exports = { sendResetCode };
