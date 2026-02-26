const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const { Resend } = require('resend');

const EMAIL_DOMAIN = process.env.EMAIL_DOMAIN;
const EMAIL_SMTP_KEY = process.env.EMAIL_SMTP_KEY;
const resend = new Resend(EMAIL_SMTP_KEY);

/**
 * Send an email verification code
 * @param {string} receiver - Recipient email address
 * @param {string|number} code - The verification code
 * @param {string} subject - Optional email subject
 * @returns {Promise<[boolean, any]>} [success, data/error]
 */
async function email_verification_code(receiver, code, subject = null) {
  try {
    const htmlPath = path.join(__dirname, 'email.html');
    const htmlTemplate = fs.readFileSync(htmlPath, 'utf8');

    const { data, error } = await resend.emails.send({
      from: `${EMAIL_DOMAIN} <verify@${EMAIL_DOMAIN}>`,
      to: [receiver],
      subject: subject || `${code} is your verification code`,
      html: htmlTemplate.replace("__CODE__", String(code))
    });

    if (error) {
      console.error("Resend API Error:", error);
      return [false, error];
    }

    return [true, data];

  } catch (err) {
    console.error("Email processing error:", err.message);
    return [false, err];
  }
}

if (require.main === module) {
  program
    .option('--sendto <email>', 'the test email address.')
    .option('--code <code>', 'test verification code', '123456')
    .parse(process.argv);

  const options = program.opts();

  if (!options.sendto) {
    console.error("Error: --sendto <email> is required.");
    process.exit(1);
  }

  (async () => {
    console.log(`Sending test code ${options.code} to ${options.sendto}...`);
    const [success, result] = await email_verification_code(options.sendto, options.code);
    if (success) {
      console.log("Email sent successfully!", result);
    } else {
      console.error("Failed to send email.");
    }
  })();
}

module.exports = {
  email_verification_code
};
