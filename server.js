const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

let userSessions = {};

// ===== START SESSION =====
app.post('/api/start-session', (req, res) => {
  const { telegram_id } = req.body;

  if (!telegram_id) {
    return res.json({ success: false, message: 'Thiếu telegram_id' });
  }

  if (!userSessions[telegram_id]) {
    userSessions[telegram_id] = {
      giay_bac: 0
    };
  }

  return res.json({ success: true });
});


// ===== VIDEO AD START (TẠO TOKEN) =====
app.post('/api/video-ad-start', (req, res) => {
  const { telegram_id } = req.body;

  if (!telegram_id) {
    return res.json({ success: false, message: 'Thiếu telegram_id' });
  }

  const now = Date.now();
  const session = userSessions[telegram_id] || {};

  // chống spam
  if (session.lastAdTime && now - session.lastAdTime < 10000) {
    return res.json({
      success: false,
      message: 'Vui lòng chờ trước khi xem tiếp'
    });
  }

  // nếu đang có token chưa dùng
  if (session.adToken) {
    return res.json({
      success: false,
      message: 'Bạn đang xem quảng cáo khác'
    });
  }

  const token = crypto.randomBytes(16).toString('hex');

  userSessions[telegram_id] = {
    ...session,
    adToken: token,
    adStartTime: now
  };

  return res.json({
    success: true,
    token
  });
});


// ===== VIDEO AD COMPLETE =====
app.post('/api/video-ad-complete', (req, res) => {
  const { telegram_id, token } = req.body;

  if (!telegram_id || !token) {
    return res.json({ success: false, message: 'Thiếu dữ liệu' });
  }

  const session = userSessions[telegram_id];

  if (!session || session.adToken !== token) {
    return res.json({
      success: false,
      message: 'Token không hợp lệ hoặc đã dùng'
    });
  }

  const now = Date.now();

  // phải xem ít nhất 3s
  if (now - session.adStartTime < 3000) {
    return res.json({
      success: false,
      message: 'Xem quảng cáo chưa đủ thời gian'
    });
  }

  // reset token
  session.adToken = null;
  session.lastAdTime = now;

  // cộng thưởng
  session.giay_bac = (session.giay_bac || 0) + 10;

  return res.json({
    success: true,
    message: '🎉 Nhận thưởng thành công',
    giay_bac: session.giay_bac
  });
});


app.get('/', (req, res) => {
  res.send('Server đang chạy');
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('Server chạy tại cổng ' + PORT);
});