import { BrowserRouter } from "react-router-dom";
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { UserProvider } from "./utils/UserContext.jsx";
import { registerSW } from 'virtual:pwa-register'

registerSW()

createRoot(document.getElementById('root')).render(

	<UserProvider>
		<BrowserRouter>
			<App />
		</BrowserRouter>
	</UserProvider>

)
