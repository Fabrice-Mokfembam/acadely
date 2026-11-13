import { Layers3 } from 'lucide-react';

export default function WorkspaceSkeleton(){
 return <main className="workspace-loader" aria-busy="true" aria-label="Preparing your school workspace">
  <div className="workspace-loader-glow workspace-loader-glow-one"/>
  <div className="workspace-loader-glow workspace-loader-glow-two"/>
  <section className="workspace-loader-card">
   <div className="workspace-loader-mark"><Layers3 size={30}/></div>
   <div className="workspace-loader-name">School Reports</div>
   <span className="workspace-loader-eyebrow">YOUR SCHOOL WORKSPACE</span>
   <h1>Getting everything ready.</h1>
   <p>Preparing your classes, results and reports.</p>
   <div className="workspace-loader-progress" aria-hidden="true"><span/></div>
  </section>
  <footer>English &amp; French · Secondary education</footer>
 </main>;
}
