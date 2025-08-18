const app = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const QRcode = require('qrcode');
const nodemailer = require('nodemailer');

app.use(cors());
app.use(express.json());

const orderPath = path.join(__dirname, 'data', 'order.json');

if(!fs.existsSync(orderPath)) {
  fs.writeFileSync(orderPath, JSON.stringify({ orders:[] }, null, 2));
}

//lista pedidos
app.get('/api/list', (req, res) => {
  console.log('/api/list');
});

//salvar pedido e envia qr code por emaill
app.post('/api/reserva', (req, res) => {
  console.log('/api/reserva');
});

//atualiza status
app.put('/api/reserva/:id_order', (req, ser) => {
  console.log('/api/reserva/:id_order')
});

app.listen(3001, () => {
  console.log('Servidor rodando em http://localhost:3001')
})