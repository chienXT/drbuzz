'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const connectDB  = require('../../config/database');
const User       = require('../models/User');
const Category   = require('../models/Category');
const Post       = require('../models/Post');
const Story      = require('../models/Story');
const Chapter    = require('../models/Chapter');

const CATEGORIES = [
  { name:'Drama hot',     slug:'drama-hot',    color:'#fee2e2', icon:'🔥' },
  { name:'Tin tức',       slug:'tin-tuc',       color:'#eff6ff', icon:'📰' },
  { name:'Showbiz',       slug:'showbiz',       color:'#fef3c7', icon:'⭐' },
  { name:'Phim & Series', slug:'phim-series',   color:'#f0fdf4', icon:'🎬' },
  { name:'Music',         slug:'music',          color:'#fdf4ff', icon:'🎵' },
  { name:'Review',        slug:'review',         color:'#fff7ed', icon:'📝' },
];

async function seed() {
  await connectDB();
  console.log('\n🌱 Seeding DramaBuzz V4...\n');

  // Admin
  let admin = await User.findOne({ isAdmin: true });
  if (!admin) {
    admin = await User.create({ username: process.env.ADMIN_USERNAME||'admin', password: process.env.ADMIN_PASSWORD||'Admin@123456', displayName: process.env.ADMIN_DISPLAY_NAME||'Quản trị viên', isAdmin: true });
    console.log('✅ Admin:', admin.username);
  } else console.log('ℹ️  Admin exists:', admin.username);

  // Categories
  const cats = [];
  for (const d of CATEGORIES) {
    let c = await Category.findOne({ slug: d.slug });
    if (!c) { c = await Category.create(d); console.log('✅ Category:', c.name); }
    else console.log('ℹ️  Category exists:', c.name);
    cats.push(c);
  }

  // Sample posts
  if (await Post.countDocuments() === 0) {
    await Post.insertMany([
      { title:'Lộ diện nghi án hẹn hò S&T – MX xôn xao mạng xã hội', excerpt:'Hình ảnh mờ nhân vật hạng A tại nhà hàng sang trọng gây sốt toàn mạng.', content:'<p>Cộng đồng mạng chia hai phe tranh cãi dữ dội...</p>', categories:[cats[0]._id], tags:['drama','hẹn hò'], images:['https://picsum.photos/seed/drama1/800/450'], author: admin._id },
      { title:'Nam diễn viên V tuyên bố giải nghệ ở đỉnh cao sự nghiệp', excerpt:'Dòng trạng thái dài khiến hàng triệu fan bàng hoàng không thể tin.', content:'<p>Showbiz Việt chấn động với thông báo giải nghệ bất ngờ...</p>', categories:[cats[1]._id,cats[2]._id], tags:['giải nghệ','tin tức'], images:['https://picsum.photos/seed/news1/800/450'], author: admin._id },
      { title:'Top 10 phim Hàn hay nhất nửa đầu 2025', excerpt:'Danh sách những bộ phim đang làm mưa làm gió màn ảnh nhỏ.', content:'<ul><li>Phim A – Rating 25%</li><li>Phim B – Rating 21%</li></ul>', categories:[cats[3]._id], tags:['phim hàn','top'], images:['https://picsum.photos/seed/kdrama/800/450'], author: admin._id },
      { title:'Drama Streamer X vs Y: Loạt phát ngôn cay độc gây bão', excerpt:'Cuộc chiến bóc phốt leo thang sau buổi live stream thâu đêm.', content:'<p>Hàng loạt bằng chứng được tung ra...</p>', categories:[cats[0]._id], tags:['drama','streamer'], images:['https://picsum.photos/seed/stream1/800/450'], author: admin._id },
    ]);
    console.log('✅ 4 sample posts created');
  } else console.log('ℹ️  Posts already exist');

  // Sample stories + chapters
  if (await Story.countDocuments() === 0) {
    const sampleStories = await Story.insertMany([
      {
        title: 'Thanh Pho Co Suong',
        slug: 'thanh-pho-co-suong',
        author: 'Le Minh Quang',
        description: 'Mot truyen tam ly - bi an, theo chan mot nha bao tre ve thi tran co nhieu mat tich khong dau vet.',
        coverImage: 'https://picsum.photos/seed/story-fog-city/420/560',
        genres: ['Bi an', 'Tam ly', 'Do thi'],
        status: 'ongoing',
        views: 18240,
      },
      {
        title: 'Song Kiem Truong Ca',
        slug: 'song-kiem-truong-ca',
        author: 'Trinh An',
        description: 'Hanh trinh vo hiep day bien dong cua hai huynh de giua loat am muu giang ho.',
        coverImage: 'https://picsum.photos/seed/story-song-kiem/420/560',
        genres: ['Vo hiep', 'Phieu luu'],
        status: 'completed',
        views: 42590,
      },
      {
        title: 'Nam Thang Qua Nhanh',
        slug: 'nam-thang-qua-nhanh',
        author: 'Ha Nhi',
        description: 'Chuyen tinh thanh xuan nhe nhang ve nhung nguoi tre thuong nhau trong khoang thoi gian dai nhat cua doi minh.',
        coverImage: 'https://picsum.photos/seed/story-youth/420/560',
        genres: ['Ngon tinh', 'Thanh xuan', 'Doi thuong'],
        status: 'ongoing',
        views: 23770,
      },
    ]);

    const chapterDocs = [];
    sampleStories.forEach((story) => {
      for (let i = 1; i <= 6; i += 1) {
        chapterDocs.push({
          storyId: story._id,
          chapterNumber: i,
          title: `Chuong ${i}`,
          content: `<p>Dem thu ${i}, gio lanh tran ve tren pho cu. ${story.title} mo ra mot manh ky uc moi cho doc gia.</p><p>Khong ai biet su that dang nam o dau, nhung moi chuong deu de lai dau vet cho hanh trinh tiep theo.</p>`,
        });
      }
    });

    await Chapter.insertMany(chapterDocs);
    console.log('✅ Sample stories and chapters created');
  } else {
    console.log('ℹ️  Stories already exist');
  }

  console.log('\n🎉 Seed complete!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('   Admin:', process.env.ADMIN_USERNAME||'admin');
  console.log('   Pass: ', process.env.ADMIN_PASSWORD||'Admin@123456');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  process.exit(0);
}
seed().catch(e => { console.error(e); process.exit(1); });
