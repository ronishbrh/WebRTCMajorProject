import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
// https://vite.dev/config/
export default defineConfig({
	plugins: [react(), tailwindcss()],
	//server: {
	//	https: {
	//		key: fs.readFileSync('./certs/192.168.101.4+1-key.pem'),
	//		cert: fs.readFileSync('./certs/192.168.101.4+1.pem'),
	//	}
	//}
})
