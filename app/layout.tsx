import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'School Reports — School results, simplified',description:'Teacher mark submissions, results and bilingual report cards for secondary schools.',manifest:'/manifest.webmanifest',icons:{icon:'/icon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
