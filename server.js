const express = require('express');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const TelegramBot = require('node-telegram-bot-api');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.json());

const TOKEN = process.env.TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://xuong-in-typhu.vercel.app/';
const BOT_USERNAME = process.env.BOT_USERNAME || 'xuongintyphu_bot';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const bot = new TelegramBot(TOKEN, { polling: true });

// ==================== TELEGRAM BOT SETUP ====================

// Set nút Open App ở thanh chat
const setMenuButton = () => {
  const data = JSON.stringify({
    menu_button: {
      type: 'web_app',
      text: '🏭 Mở Xưởng',
      web_app: { url: WEBAPP_URL }
    }
  });
  const options = {
    hostname: 'api.telegram.org',
    path: `/bot${TOKEN}/setChatMenuButton`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  };
  const req = https.request(options);
  req.write(data);
  req.end();
};
setMenuButton();
bot.setMyCommands([]);

// Hàm lấy hoặc tạo user
async function getOrCreateUser(msg) {
  const telegram_id = msg.from.id;
  const username = msg.from.first_name;
  const tele_username = msg.from.username || '';

  let { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegram_id)
    .single();

  if (!user) {
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        telegram_id,
        username,
        tele_username,
        giay_bac: 0,
        level: 1,
        last_mine_time: Date.now(),
        session_end: 0,
        joined_channels: [],
        claimed_milestones: []
      })
      .select()
      .single();
    if (error) console.error('Insert error:', error);
    user = newUser;
  } else {
    await supabase
      .from('users')
      .update({ tele_username })
      .eq('telegram_id', telegram_id);
  }

  return user;
}

// Lệnh /start
bot.onText(/\/start(.*)/, async (msg, match) => {
  const param = match[1].trim();
  const telegram_id = msg.from.id;
  const username = msg.from.first_name;

  let { data: existingUser } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegram_id)
    .single();

  const isNewUser = !existingUser;
  const user = await getOrCreateUser(msg);

  // Xử lý referral chỉ với user mới
  if (isNewUser && param.startsWith('ref_')) {
    const referrerId = parseInt(param.replace('ref_', ''));
    if (referrerId !== telegram_id) {
      const { data: referrer } = await supabase
        .from('users')
        .select('*')
        .eq('telegram_id', referrerId)
        .single();

      if (referrer) {
        const newGiayBac = parseFloat(referrer.giay_bac) + 1500000;
        await supabase
          .from('users')
          .update({ giay_bac: newGiayBac })
          .eq('telegram_id', referrerId);

        await supabase
          .from('users')
          .update({ referred_by: referrerId })
          .eq('telegram_id', telegram_id);

        bot.sendMessage(
          referrerId,
          `🎉 *${username}* vừa gia nhập tổ chức của bạn!\n+1,500,000 Giấy Bạc đã được cộng vào tài khoản!`,
          { parse_mode: 'Markdown' }
        );
      }
    }
  }

  bot.sendMessage(
    msg.chat.id,
    `Chào *${user.username}*! 👋\nChào mừng đến với *Xưởng In Tỷ Phú*! 🏭\n\nBắt đầu vận hành xưởng in của bạn và kiếm Giấy Bạc ngay!`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '🏭 Mở Xưởng', web_app: { url: WEBAPP_URL } }
        ]]
      }
    }
  );
});

// ==================== CONSTANTS ====================
const CHANNELS = [
  { id: '@ShareTutMMO', name: 'Share Tut MMO', reward: 10000 },
  { id: '@GRCoXu', name: 'GR • Cô Xù 🍓', reward: 10000 }
];
const VIDEO_AD_REWARD = 100000;
const VIDEO_AD_COOLDOWN_MS = 15 * 60 * 1000; // 15 phút
const REFERRAL_REWARD = 1500000;
const SESSION_DURATION_MS = 6 * 60 * 60 * 1000; // 6 giờ

// Milestone mời bạn bè
const REFERRAL_MILESTONES = [
  { count: 5,   reward: 50000,    label: 'Chiêu mộ 5 đồng bọn' },
  { count: 10,  reward: 100000,   label: 'Tổ đội 10 thành viên' },
  { count: 20,  reward: 250000,   label: 'Tổ đội 20 thành viên' },
  { count: 50,  reward: 500000,   label: 'Tổ đội 50 thành viên' },
  { count: 100, reward: 1000000,  label: 'Tổ đội 100 thành viên' }
];

// Tỷ lệ quy đổi: 20,000,000 Giấy Bạc = 2,000 VND
const GIAY_BAC_TO_VND = 2000 / 20000000; // = 0.0001 VND / Giấy Bạc
const MIN_WITHDRAW_GIAY_BAC = 20000000;

// Tốc độ theo level (Giấy Bạc/giờ)
const LEVEL_RATES = {
  1: 3600,
  2: 7200,
  3: 14400,
  4: 28800,
  5: 57600,
  6: 115200,
  7: 230400,
  8: 460800,
  9: 921600,
  10: 1843200
};

// Chi phí nâng cấp theo level hiện tại
const UPGRADE_COSTS = {
  1: 25000,
  2: 60000,
  3: 130000,
  4: 280000,
  5: 600000,
  6: 1300000,
  7: 2800000,
  8: 6000000,
  9: 13000000
};

// ==================== HELPER FUNCTIONS ====================
async function getUser(telegram_id) {
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegram_id)
    .single();
  return data;
}

// ==================== API ENDPOINTS ====================

// Lấy thông tin user
app.post('/api/user', async (req, res) => {
  const { telegram_id } = req.body;
  if (!telegram_id) return res.json({ success: false, message: 'Thiếu telegram_id' });
  const user = await getUser(telegram_id);
  if (!user) return res.json({ success: false, message: 'User không tồn tại' });
  return res.json({
    success: true,
    giay_bac: user.giay_bac,
    level: user.level,
    session_end: user.session_end,
    last_mine_time: user.last_mine_time,
    joined_channels: user.joined_channels || [],
    claimed_milestones: user.claimed_milestones || [],
    last_video_time: user.last_video_time || 0
  });
});

// Bắt đầu phiên đào (Start session)
app.post('/api/start-session', async (req, res) => {
  const { telegram_id } = req.body;
  if (!telegram_id) return res.json({ success: false, message: 'Thiếu telegram_id' });

  const user = await getUser(telegram_id);
  if (!user) return res.json({ success: false, message: 'User không tồn tại' });

  const now = Date.now();

  // Nếu phiên vẫn còn đang chạy
  if (user.session_end && user.session_end > now) {
    return res.json({ success: false, message: 'Phiên đang chạy!', session_end: user.session_end });
  }

  const sessionEnd = now + SESSION_DURATION_MS;

  await supabase
    .from('users')
    .update({ session_end: sessionEnd, last_mine_time: now })
    .eq('telegram_id', telegram_id);

  return res.json({ success: true, session_end: sessionEnd });
});

// Thu hoạch Giấy Bạc (sync coins từ client lên server)
app.post('/api/sync', async (req, res) => {
  const { telegram_id, giay_bac } = req.body;
  if (!telegram_id) return res.json({ success: false });

  const user = await getUser(telegram_id);
  if (!user) return res.json({ success: false });

  // Chỉ cập nhật nếu giá trị gửi lên >= giá trị hiện tại (tránh giảm xu)
  const newVal = Math.max(parseFloat(user.giay_bac), parseFloat(giay_bac));

  await supabase
    .from('users')
    .update({ giay_bac: newVal, last_mine_time: Date.now() })
    .eq('telegram_id', telegram_id);

  return res.json({ success: true, giay_bac: newVal });
});

// Nâng cấp level
app.post('/api/upgrade', async (req, res) => {
  const { telegram_id } = req.body;
  if (!telegram_id) return res.json({ success: false, message: 'Thiếu telegram_id' });

  const user = await getUser(telegram_id);
  if (!user) return res.json({ success: false, message: 'User không tồn tại' });

  const currentLevel = user.level;
  if (currentLevel >= 10) return res.json({ success: false, message: 'Đã đạt cấp độ tối đa!' });

  const cost = UPGRADE_COSTS[currentLevel];
  if (!cost) return res.json({ success: false, message: 'Không thể nâng cấp!' });

  if (parseFloat(user.giay_bac) < cost) {
    return res.json({ success: false, message: `Cần ${cost.toLocaleString('vi-VN')} Giấy Bạc để nâng cấp!` });
  }

  const newGiayBac = parseFloat(user.giay_bac) - cost;
  const newLevel = currentLevel + 1;

  await supabase
    .from('users')
    .update({ giay_bac: newGiayBac, level: newLevel })
    .eq('telegram_id', telegram_id);

  return res.json({
    success: true,
    message: `🎉 Lên cấp ${newLevel}! Tốc độ: ${LEVEL_RATES[newLevel].toLocaleString('vi-VN')} Giấy Bạc/giờ`,
    giay_bac: newGiayBac,
    level: newLevel
  });
});

// Check join kênh
app.post('/api/check-join', async (req, res) => {
  const { telegram_id, channel_index } = req.body;
  if (!telegram_id || channel_index === undefined) {
    return res.json({ success: false, message: 'Thiếu thông tin' });
  }

  const channel = CHANNELS[channel_index];
  if (!channel) return res.json({ success: false, message: 'Kênh không tồn tại' });

  const user = await getUser(telegram_id);
  if (!user) return res.json({ success: false, message: 'User không tồn tại' });

  const joinedChannels = user.joined_channels || [];
  if (joinedChannels.includes(channel_index)) {
    return res.json({ success: false, message: 'Bạn đã nhận thưởng kênh này rồi!', already: true });
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TOKEN}/getChatMember?chat_id=${channel.id}&user_id=${telegram_id}`
    );
    const data = await response.json();
    const status = data.result?.status;
    const joined = ['member', 'administrator', 'creator'].includes(status);

    if (!joined) {
      return res.json({ success: false, message: `Bạn chưa tham gia kênh ${channel.name}!` });
    }

    const newJoined = [...joinedChannels, channel_index];
    const newGiayBac = parseFloat(user.giay_bac) + channel.reward;

    await supabase
      .from('users')
      .update({ joined_channels: newJoined, giay_bac: newGiayBac })
      .eq('telegram_id', telegram_id);

    return res.json({
      success: true,
      message: `+${channel.reward.toLocaleString('vi-VN')} Giấy Bạc từ nhiệm vụ tham gia kênh!`,
      giay_bac: newGiayBac,
      joined_channels: newJoined
    });
  } catch (err) {
    console.error(err);
    return res.json({ success: false, message: 'Lỗi kiểm tra, thử lại!' });
  }
});

// Xem video quảng cáo - bắt đầu
app.post('/api/video-ad-start', async (req, res) => {
  const { telegram_id } = req.body;
  if (!telegram_id) return res.json({ success: false });

  const user = await getUser(telegram_id);
  if (!user) return res.json({ success: false });

  const now = Date.now();
  const lastVideoTime = user.last_video_time || 0;
  const cooldownRemaining = (lastVideoTime + VIDEO_AD_COOLDOWN_MS) - now;

  if (cooldownRemaining > 0) {
    const minutes = Math.ceil(cooldownRemaining / 60000);
    return res.json({
      success: false,
      message: `Vui lòng chờ thêm ${minutes} phút nữa!`,
      cooldown_remaining: cooldownRemaining
    });
  }

  return res.json({ success: true, message: 'Bắt đầu xem quảng cáo' });
});

// Xem video quảng cáo - hoàn thành (gọi sau khi user xem xong)
app.post('/api/video-ad-complete', async (req, res) => {
  const { telegram_id } = req.body;
  if (!telegram_id) return res.json({ success: false });

  const user = await getUser(telegram_id);
  if (!user) return res.json({ success: false });

  const now = Date.now();
  const lastVideoTime = user.last_video_time || 0;

  // Double-check cooldown server-side
  if ((lastVideoTime + VIDEO_AD_COOLDOWN_MS) > now) {
    return res.json({ success: false, message: 'Cooldown chưa hết!' });
  }

  const newGiayBac = parseFloat(user.giay_bac) + VIDEO_AD_REWARD;

  await supabase
    .from('users')
    .update({ giay_bac: newGiayBac, last_video_time: now })
    .eq('telegram_id', telegram_id);

  return res.json({
    success: true,
    message: `+${VIDEO_AD_REWARD.toLocaleString('vi-VN')} Giấy Bạc từ xem video!`,
    giay_bac: newGiayBac
  });
});

// Đếm số lượt giới thiệu
app.post('/api/referral-count', async (req, res) => {
  const { telegram_id } = req.body;
  if (!telegram_id) return res.json({ success: false });

  const { count } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('referred_by', telegram_id);

  return res.json({ success: true, count: count ?? 0 });
});

// Nhận thưởng milestone mời bạn bè
app.post('/api/claim-milestone', async (req, res) => {
  const { telegram_id, milestone_index } = req.body;
  if (!telegram_id || milestone_index === undefined) {
    return res.json({ success: false, message: 'Thiếu thông tin' });
  }

  const milestone = REFERRAL_MILESTONES[milestone_index];
  if (!milestone) return res.json({ success: false, message: 'Milestone không tồn tại' });

  const user = await getUser(telegram_id);
  if (!user) return res.json({ success: false, message: 'User không tồn tại' });

  const claimedMilestones = user.claimed_milestones || [];
  if (claimedMilestones.includes(milestone_index)) {
    return res.json({ success: false, message: 'Bạn đã nhận thưởng milestone này rồi!' });
  }

  // Đếm số lượt giới thiệu
  const { count } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('referred_by', telegram_id);

  if ((count ?? 0) < milestone.count) {
    return res.json({
      success: false,
      message: `Cần chiêu mộ đủ ${milestone.count} đồng bọn! (Hiện tại: ${count ?? 0})`
    });
  }

  const newClaimed = [...claimedMilestones, milestone_index];
  const newGiayBac = parseFloat(user.giay_bac) + milestone.reward;

  await supabase
    .from('users')
    .update({ claimed_milestones: newClaimed, giay_bac: newGiayBac })
    .eq('telegram_id', telegram_id);

  return res.json({
    success: true,
    message: `🎉 Nhận ${milestone.reward.toLocaleString('vi-VN')} Giấy Bạc từ "${milestone.label}"!`,
    giay_bac: newGiayBac,
    claimed_milestones: newClaimed
  });
});

// Quy đổi phần thưởng (rút về tài khoản ngân hàng)
app.post('/api/withdraw', async (req, res) => {
  const { telegram_id, giay_bac_amount, bank_name, bank_account, account_name } = req.body;

  if (!telegram_id || !giay_bac_amount || !bank_name || !bank_account || !account_name) {
    return res.json({ success: false, message: 'Vui lòng điền đầy đủ thông tin!' });
  }

  if (giay_bac_amount < MIN_WITHDRAW_GIAY_BAC) {
    return res.json({
      success: false,
      message: `Tối thiểu ${MIN_WITHDRAW_GIAY_BAC.toLocaleString('vi-VN')} Giấy Bạc để quy đổi!`
    });
  }

  const user = await getUser(telegram_id);
  if (!user) return res.json({ success: false, message: 'User không tồn tại' });

  if (parseFloat(user.giay_bac) < giay_bac_amount) {
    return res.json({ success: false, message: 'Số Giấy Bạc không đủ!' });
  }

  const vnd_amount = Math.floor(giay_bac_amount * GIAY_BAC_TO_VND);
  const newGiayBac = parseFloat(user.giay_bac) - giay_bac_amount;

  // Lưu yêu cầu rút vào DB
  const { error } = await supabase.from('withdrawals').insert({
    telegram_id,
    username: user.username,
    tele_username: user.tele_username,
    giay_bac_amount,
    vnd_amount,
    bank_name,
    bank_account,
    account_name,
    status: 'pending',
    created_at: new Date().toISOString()
  });

  if (error) {
    console.error('Withdraw insert error:', error);
    return res.json({ success: false, message: 'Lỗi hệ thống, thử lại!' });
  }

  await supabase
    .from('users')
    .update({ giay_bac: newGiayBac })
    .eq('telegram_id', telegram_id);

  // Thông báo cho admin (nếu có ADMIN_CHAT_ID)
  if (process.env.ADMIN_CHAT_ID) {
    bot.sendMessage(
      process.env.ADMIN_CHAT_ID,
      `💸 *Yêu cầu quy đổi mới*\n\n` +
      `👤 User: ${user.username} (@${user.tele_username})\n` +
      `🆔 ID: ${telegram_id}\n` +
      `💰 Giấy Bạc: ${giay_bac_amount.toLocaleString('vi-VN')}\n` +
      `💵 VND: ${vnd_amount.toLocaleString('vi-VN')} đ\n` +
      `🏦 Ngân hàng: ${bank_name}\n` +
      `📋 STK: ${bank_account}\n` +
      `👤 Chủ TK: ${account_name}`,
      { parse_mode: 'Markdown' }
    );
  }

  return res.json({
    success: true,
    message: `✅ Yêu cầu quy đổi ${vnd_amount.toLocaleString('vi-VN')} VND đã ghi nhận!\nAdmin sẽ xử lý trong 24h.`,
    giay_bac: newGiayBac
  });
});

// API trả về constants cho frontend
app.get('/api/config', (req, res) => {
  res.json({
    channels: CHANNELS.map(c => ({ name: c.name, reward: c.reward })),
    referral_milestones: REFERRAL_MILESTONES,
    level_rates: LEVEL_RATES,
    upgrade_costs: UPGRADE_COSTS,
    video_ad_reward: VIDEO_AD_REWARD,
    video_ad_cooldown_ms: VIDEO_AD_COOLDOWN_MS,
    referral_reward: REFERRAL_REWARD,
    session_duration_ms: SESSION_DURATION_MS,
    min_withdraw: MIN_WITHDRAW_GIAY_BAC,
    giay_bac_to_vnd: GIAY_BAC_TO_VND
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🏭 Xưởng In Tỷ Phú server chạy port ${PORT}`));
