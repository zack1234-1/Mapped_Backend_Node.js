const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
  // 1. Create a transporter (Example using Gmail)
  // For production, use services like SendGrid or Mailgun
  const transporter = nodemailer.createTransport({
    service: 'Gmail', 
    auth: {
      user: process.env.EMAIL_USER, // Your email
      pass: process.env.EMAIL_PASS, // Your App Password (not your regular password)
    },
  });

  // 2. Define email options
  const mailOptions = {
    from: `Mapped Support <${process.env.EMAIL_USER}>`,
    to: options.email,
    subject: options.subject,
    text: options.message,
    html: options.html,
  };

  // 3. Actually send the email
  await transporter.sendMail(mailOptions);
};

module.exports = sendEmail;