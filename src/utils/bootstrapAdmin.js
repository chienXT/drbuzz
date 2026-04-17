'use strict';

const User = require('../models/User');

const bootstrapAdmin = async () => {
  const username = String(process.env.ADMIN_USERNAME || '').trim();
  const password = String(process.env.ADMIN_PASSWORD || '').trim();
  const displayName = String(process.env.ADMIN_DISPLAY_NAME || 'Quản trị viên').trim();

  if (!username || !password) {
    console.log('ℹ️  Admin bootstrap skipped: missing ADMIN_USERNAME or ADMIN_PASSWORD');
    return;
  }

  const existingAdmin = await User.findOne({ isAdmin: true }).select('_id username').lean();
  if (existingAdmin) {
    console.log(`ℹ️  Admin bootstrap skipped: admin already exists (${existingAdmin.username})`);
    return;
  }

  const existingUser = await User.findOne({ username }).select('_id username isAdmin').lean();
  if (existingUser) {
    if (existingUser.isAdmin) {
      console.log(`ℹ️  Admin bootstrap skipped: ${username} is already admin`);
      return;
    }

    await User.findByIdAndUpdate(existingUser._id, {
      $set: { isAdmin: true, displayName: displayName || existingUser.username },
    });
    console.log(`✅ Admin bootstrap promoted existing user: ${username}`);
    return;
  }

  await User.create({
    username,
    password,
    displayName: displayName || username,
    isAdmin: true,
  });

  console.log(`✅ Admin bootstrap created: ${username}`);
};

module.exports = bootstrapAdmin;