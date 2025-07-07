const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const validator = require("validator");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet());

const allowedOrigins = [
  "http://localhost:3000", // Create React App default
  "http://localhost:5173", // Vite default
  "https://groenv8.com",
  "https://newgeofrontend.vercel.app",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        console.log("Blocked origin:", origin);
        console.log("Allowed origins:", allowedOrigins);
        return callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Rate limiting
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    error: "Too many contact form submissions, please try again later.",
  },
});

// Body parser middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

const createTransporter = () => {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

// Validation function
const validateContactForm = (data) => {
  const errors = {};

  // Name validation
  if (!data.name || !data.name.trim()) {
    errors.name = "Name is required";
  } else if (data.name.trim().length < 2) {
    errors.name = "Name must be at least 2 characters long";
  } else if (data.name.trim().length > 100) {
    errors.name = "Name must be less than 100 characters";
  }

  // Email validation
  if (!data.email || !data.email.trim()) {
    errors.email = "Email is required";
  } else if (!validator.isEmail(data.email)) {
    errors.email = "Invalid email format";
  }

  // Subject validation
  if (!data.subject || !data.subject.trim()) {
    errors.subject = "Subject is required";
  } else if (data.subject.trim().length < 5) {
    errors.subject = "Subject must be at least 5 characters long";
  } else if (data.subject.trim().length > 200) {
    errors.subject = "Subject must be less than 200 characters";
  }

  if (data.message && data.message.length > 2000) {
    errors.message = "Message must be less than 2000 characters";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

// Email template function
const createEmailTemplate = (formData) => {
  const { name, email, subject, message } = formData;
  const timestamp = new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return {
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .field { margin-bottom: 20px; }
            .label { font-weight: bold; color: #555; display: block; margin-bottom: 5px; }
            .value { background: white; padding: 15px; border-radius: 5px; border-left: 4px solid #667eea; }
            .message-box { background: white; padding: 20px; border-radius: 5px; border: 2px solid #e1e5e9; min-height: 100px; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
            .timestamp { color: #888; font-size: 14px; text-align: right; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📧 New Contact Form Submission</h1>
              <p>You have received a new message from your website</p>
            </div>
            <div class="content">
              <div class="field">
                <span class="label">👤 Name:</span>
                <div class="value">${validator.escape(name.trim())}</div>
              </div>

              <div class="field">
                <span class="label">📧 Email:</span>
                <div class="value">
                  <a href="mailto:${validator.escape(
                    email
                  )}" style="color: #667eea; text-decoration: none;">
                    ${validator.escape(email)}
                  </a>
                </div>
              </div>

              <div class="field">
                <span class="label">📋 Subject:</span>
                <div class="value">${validator.escape(subject.trim())}</div>
              </div>

              <div class="field">
                <span class="label">💬 Message:</span>
                <div class="message-box">
                  ${
                    message && message.trim()
                      ? validator.escape(message.trim()).replace(/\n/g, "<br>")
                      : '<em style="color: #888;">No message provided</em>'
                  }
                </div>
              </div>

              <div class="timestamp">
                🕐 Received: ${timestamp}
              </div>
            </div>
            <div class="footer">
              <p>This email was automatically generated from your website's contact form.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
      NEW CONTACT FORM SUBMISSION
      ========================

      Name: ${name.trim()}
      Email: ${email}
      Subject: ${subject.trim()}
      Message: ${
        message && message.trim() ? message.trim() : "No message provided"
      }

      Received: ${timestamp}

      ---
      This email was automatically generated from your website's contact form.
    `,
  };
};

// Contact form endpoint
app.post("/api/contact", contactLimiter, async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    // Validate input
    const validation = validateContactForm({ name, email, subject, message });

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: validation.errors,
      });
    }

    // Create email content
    const emailTemplate = createEmailTemplate({
      name,
      email,
      subject,
      message,
    });

    // Create transporter
    const transporter = createTransporter();

    const mailOptions = {
      from: `"${validator.escape(name.trim())}" <${process.env.EMAIL_USER}>`,
      to: process.env.RECIPIENT_EMAIL || process.env.EMAIL_USER,
      replyTo: email,
      subject: `Contact Form: ${validator.escape(subject.trim())}`,
      html: emailTemplate.html,
      text: emailTemplate.text,
    };

    console.log(
      "Sending email to admin:",
      process.env.RECIPIENT_EMAIL || process.env.EMAIL_USER
    );
    const adminEmailResult = await transporter.sendMail(mailOptions);
    console.log("Admin email sent successfully:", adminEmailResult.messageId);

    // Send auto-reply to customer (optional)
    if (process.env.SEND_AUTO_REPLY === "true") {
      console.log("Sending auto-reply to customer:", email);
      const autoReplyOptions = {
        from: `"Your Website" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Thank you for contacting us!",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #667eea;">Thank you for your message!</h2>
            <p>Hi ${validator.escape(name.trim())},</p>
            <p>We have received your message and will get back to you as soon as possible.</p>
            <div style="background: #f9f9f9; padding: 20px; border-radius: 5px; margin: 20px 0;">
              <h3>Your message details:</h3>
              <p><strong>Subject:</strong> ${validator.escape(
                subject.trim()
              )}</p>
              <p><strong>Message:</strong> ${
                message && message.trim()
                  ? validator.escape(message.trim())
                  : "No message provided"
              }</p>
            </div>
            <p>Best regards,<br>Your Website Team</p>
          </div>
        `,
      };

      const customerEmailResult = await transporter.sendMail(autoReplyOptions);
      console.log(
        "Customer auto-reply sent successfully:",
        customerEmailResult.messageId
      );
    }

    res.status(200).json({
      success: true,
      message: "Message sent successfully!",
    });
  } catch (error) {
    console.error("Contact form error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to send message. Please try again later.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error("Server error:", error);
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? error.message : undefined,
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📧 Email service configured for: ${process.env.EMAIL_USER}`);
  // console.log(`🌐 CORS enabled for origins:`, allowedOrigins);
});
