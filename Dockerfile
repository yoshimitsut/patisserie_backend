# Usa uma imagem leve do Node.js
FROM node:18-alpine

# Define o diretório de trabalho
WORKDIR /

# Copia os arquivos de dependências
COPY package*.json ./

# Instala as dependências
RUN npm install --production

# Copia o restante do código
COPY . .

# Define a porta usada pelo servidor
EXPOSE 8080

# Comando para iniciar o app
CMD ["npm", "start"]
