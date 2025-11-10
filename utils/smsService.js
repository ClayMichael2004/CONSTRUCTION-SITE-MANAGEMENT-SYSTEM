const africastalking = require('africastalking');
const db = require('../config/db');

// ✅ Normalize Kenyan phone numbers (e.g., 0712345678 → +254712345678)
function formatPhoneNumber(phone) {
  if (!phone) return null;
  phone = phone.replace(/\D/g, ''); // remove non-digits
  if (phone.startsWith('0')) phone = '254' + phone.slice(1);
  if (!phone.startsWith('254')) phone = '254' + phone;
  return '+' + phone;
}

// ✅ Initialize Africa's Talking with your credentials
const africasTalking = africastalking({
  apiKey: process.env.AFRICASTALKING_API_KEY,
  username: process.env.AFRICASTALKING_USERNAME
});

const sms = africasTalking.SMS;

// ✅ Function to send payment SMS
exports.sendPaymentSMS = async (worker, amount, start, end) => {
  const phone = formatPhoneNumber(worker.phone);
  if (!phone) return { success: false, message: 'Invalid worker phone number' };

  const message = `Hello ${worker.full_name}, your payment of KSh ${amount} for the period ${start} to ${end} has been processed. Thank you — CLAY CONSTRUCTION. Collect your payment on Saturday from your site manager.`;

  try {
    const result = await sms.send({
      to: [phone],
      message: message,
      // from field removed - good!
      enqueue: true
    });

    // ✅ BETTER LOGGING - Show the full recipient details
    console.log('✅ SMS API Response:', JSON.stringify(result, null, 2));
    
    const responseStr = JSON.stringify(result.SMSMessageData || result);

    // Log to database
    db.query(
      `INSERT INTO sms_logs (worker_id, phone, message, status, response)
       VALUES (?, ?, ?, ?, ?)`,
      [worker.id || null, phone, message, 'Sent', responseStr],
      (err) => {
        if (err) console.error('SMS log insert error:', err);
      }
    );

    // Check if actually delivered
    if (result.SMSMessageData?.Recipients?.[0]?.status === 'Success') {
      console.log('🎉 SMS DELIVERED SUCCESSFULLY!');
      return { success: true, message: 'SMS delivered successfully', result };
    } else {
      console.log('⚠️ SMS accepted but not delivered - check recipient details');
      return { success: false, message: 'SMS accepted but not delivered', result };
    }
    
  } catch (err) {
    console.error('❌ SMS sending failed:', err.message);
    
    db.query(
      `INSERT INTO sms_logs (worker_id, phone, message, status, response)
       VALUES (?, ?, ?, ?, ?)`,
      [worker.id || null, phone, message, 'Failed', err.message],
      (e2) => {
        if (e2) console.error('Failed to log SMS error:', e2);
      }
    );

    return { success: false, message: err.message };
  }
};