const express = require('express');
const path = require('path');
const cors = require('cors');
const QRcode = require('qrcode');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const fs = require('fs');
const { error } = require('console');

app.use(cors());
app.use(express.json());

const orderPath = path.join(__dirname, 'data', 'order.json');

if(!fs.existsSync(orderPath)) {
  fs.writeFileSync(orderPath, JSON.stringify({ orders:[] }, null, 2));
}

//lista pedidos
app.get('/api/list', (req, res) => {
  fs.readFile(orderPath, 'utf-8', (err, data)=> {
    if (err) {
      return res.status(500).json({ error: 'Erro ao ler os pedidos.' })
    }

    try {
      const pedidos = JSON.parse(data);
      res.json(pedidos.orders);
    } catch (error) {
      res.status(500).json({ error: 'Arquivo JSON inválidos.' })
    }
  })
});

//salvar pedido e envia qr code por emaill
app.post('/api/reservar', (req, res) => {
  const newOrder = req.body;
  
  fs.readFile(orderPath, 'utf-8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Erro ao ler o arquivo.' });
    
    let json;
    try {
      json = JSON.parse(data);
    } catch (error) {
      return res.status(500).json({ error: 'Arquivo JSON inválido.' });
    }

    const lastId = json.orders.length > 0 ? json.orders[json.orders.length - 1].id_order : 0;
    newOrder.id_order = lastId + 1;

    newOrder.status= '未';
    // newOrder.payment = '未';

    json.orders.push(newOrder);

    fs.writeFile(orderPath, JSON.stringify(json, null, 2), (err) => {
      if (err) return res.status(500).json({ error: 'Erro ao salvar dados no arquivo json.'})

      //Configurar e-mail
      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,       // 465 -> SSL
        secure: true,    // true para 465
        auth: {
          user: process.env.EMAIL_USER, // seu email
          pass: process.env.EMAIL_PASS  // senha de app
        }
      });

      //Qr Code
      QRcode.toDataURL(String(newOrder.id_order), async(err, qrDataUrl) => {
        if (err) {
          console.error('Erro ao gerar QR Code:', err);
          return res.json({ success: true, id:newOrder.id_order, emailSent: false });
        }

        const htmlContent = `
        <h2>🎂 ご注文ありがとうございます！</h2>
          <p>注文番号: <strong>${newOrder.id_order}</strong></p>
          <p>お名前: ${newOrder.first_name} ${newOrder.last_name}</p>
          <p>電話番号: ${newOrder.tel}</p>
          <p>受け取り日時: ${newOrder.date} - ${newOrder.pickupHour}</p>
          <p>その他: ${newOrder.message} </p>
          <p></p>
          <p>ご注文内容:</p>
          <ul>
            ${newOrder.cakes.map(c => `<li>${c.name} - ${c.size} - ${c.amount}個</li>`).join('')}
          </ul>
          <p></p>
          <p>こちらが受付用QRコードです:</p>
          <img src="cid:qrcode" alt="QRコード" width="400" />
          <p>またのご利用をお待ちしております。</p>
        `;

        const mailOptions = {
          from: `"Pâtisserie Cake" <${process.env.EMAIL_USER}>`,
          to: [newOrder.email, process.env.EMAIL_USER], // manda para o cliente E para você
          subject: `🎂 ご注文確認 - 注文番号 ${newOrder.id_order}`,
          html: htmlContent,
          attachments: [
            {
              filename: 'qrcode.png',
              content: qrDataUrl.split("base64,")[1],
              encoding: 'base64',
              cid: 'qrcode',
            },
          ],
        };

        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            console.log('Erro ao Enviar e-mail:', error);
            return res.json({ success: true, id: newOrder.id_order, emailSent: false });
          }
          console.log('E-mail enviado com QR Code!');
          res.json({ success: true, id:newOrder.id_order, emailSent: true });
        });

      });
    });
  });
});

//atualiza pedido
app.put('/api/reservar/:id_order', (req, res) => {
  const id_order = parseInt(req.params.id_order, 10);
  const { status } = req.body;

  fs.readFile(orderPath, 'utf-8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Erro ao ler Arquivo.'});
    
    let json;
    try {
      json = JSON.parse(data);
    } catch (error) {
      return res.status(500).json({ error: 'Arquivo JSON inválido.'})
    }

    const index = json.orders.findIndex(o => o.id_order === id_order);
    if(index === -1){
      return res.status(404).json({ error: 'Pedido não encontrado.' })
    }

    json.orders[index].status = status;

    fs.writeFile(orderPath, JSON.stringify(json, null, 2), (err) => {
      if (err) return res.status(500).json({error: 'Erro ao salvar arquivo.'});
      res.json({success: true, order: json.orders[index]})
    })
  })
});

app.listen(3001, () => {
  console.log('Servidor rodando em http://localhost:3001')
})