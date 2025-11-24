const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// تكوين Socket.io للإنترنت
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// خدم الملفات الثابتة
app.use(express.static(path.join(__dirname, 'public')));

// إعدادات إضافية للأمان
app.set('trust proxy', 1);

// إضافة health check
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toLocaleString('ar-SA'),
    service: 'نظام مراقبة الاختبارات عبر WebRTC'
  });
});

// صفحة رئيسية إضافية
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// تخزين الغرف والمستخدمين
const rooms = new Map();

console.log('🔧 سيرفر مراقبة الاختبارات يعمل...');

io.on('connection', (socket) => {
  console.log('👤 مستخدم متصل:', socket.id, 'من IP:', socket.handshake.address);

  // انضمام لغرفة
  socket.on('join', (data) => {
    const { room, name, type } = data;
    socket.join(room);
    
    console.log(`🎯 ${name} انضم للغرفة ${room} كـ ${type}`);
    
    // إعلام الآخرين في الغرفة
    socket.to(room).emit('user-joined', { 
      id: socket.id, 
      name, 
      type,
      timestamp: new Date().toLocaleString('ar-SA')
    });
    
    // إرسال قائمة المستخدمين الحاليين
    if (!rooms.has(room)) {
      rooms.set(room, new Map());
    }
    rooms.get(room).set(socket.id, { name, type, joinedAt: new Date() });
    
    const users = Array.from(rooms.get(room).values());
    io.to(room).emit('users-update', users);
    
    // إرسال تأكيد الانضمام
    socket.emit('joined-success', { 
      room, 
      usersCount: users.length,
      message: `تم الانضمام للغرفة ${room} بنجاح`
    });
  });

  // إرسال عرض WebRTC
  socket.on('offer', (data) => {
    console.log('📡 عرض من:', data.from, 'للغرفة:', data.room);
    socket.to(data.room).emit('offer', {
      offer: data.offer,
      from: data.from,
      fromId: socket.id,
      timestamp: new Date().toLocaleString('ar-SA')
    });
  });

  // إرسال إجابة WebRTC
  socket.on('answer', (data) => {
    console.log('📡 إجابة من:', data.from, 'للغرفة:', data.room);
    socket.to(data.room).emit('answer', {
      answer: data.answer,
      from: data.from,
      fromId: socket.id,
      timestamp: new Date().toLocaleString('ar-SA')
    });
  });

  // إرسال ICE Candidate
  socket.on('ice-candidate', (data) => {
    console.log('🧊 ICE candidate من:', data.room);
    socket.to(data.room).emit('ice-candidate', {
      candidate: data.candidate,
      fromId: socket.id,
      timestamp: new Date().toLocaleString('ar-SA')
    });
  });

  // طلب عرض جديد
  socket.on('request-new-offer', (data) => {
    console.log('🔄 طلب عرض جديد من:', data.fromId);
    socket.to(data.fromId).emit('recreate-offer');
  });

  // مغادرة الغرفة
  socket.on('leave', (data) => {
    const { room } = data;
    console.log('🚪 مستخدم يغادر:', socket.id, 'من الغرفة:', room);
    
    if (rooms.has(room)) {
      rooms.get(room).delete(socket.id);
      const users = Array.from(rooms.get(room).values());
      io.to(room).emit('users-update', users);
    }
    
    socket.to(room).emit('user-left', { 
      id: socket.id,
      timestamp: new Date().toLocaleString('ar-SA')
    });
  });

  // انقطاع الاتصال
  socket.on('disconnect', (reason) => {
    console.log('👤 مستخدم انقطع:', socket.id, 'السبب:', reason);
    
    // إزالة من جميع الغرف
    for (const [room, users] of rooms.entries()) {
      if (users.has(socket.id)) {
        const userInfo = users.get(socket.id);
        users.delete(socket.id);
        const updatedUsers = Array.from(users.values());
        io.to(room).emit('users-update', updatedUsers);
        socket.to(room).emit('user-left', { 
          id: socket.id,
          name: userInfo.name,
          timestamp: new Date().toLocaleString('ar-SA')
        });
        console.log(`🗑️ تم إزالة ${userInfo.name} من الغرفة ${room}`);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log('='.repeat(60));
  console.log('🌐 نظام مراقبة الاختبارات جاهز للعمل');
  console.log(`📍 محلي: http://localhost:${PORT}`);
  console.log(`🌐 شبكة: http://[YOUR_IP]:${PORT}`);
  console.log('='.repeat(60));
  console.log('🚀 لجعله يعمل عبر الإنترنت، استخدم:');
  console.log('   npx localtunnel --port 3000');
  console.log('   ssh -R 80:localhost:3000 serveo.net');
  console.log('='.repeat(60));
});