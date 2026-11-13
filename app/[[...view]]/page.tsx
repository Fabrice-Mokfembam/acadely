import {Suspense} from 'react';
import Workspace from '../../components/workspace';
import WorkspaceSkeleton from '../../components/workspace-skeleton';

export default function WorkspaceView(){
 return <Suspense fallback={<WorkspaceSkeleton/>}><Workspace/></Suspense>;
}
