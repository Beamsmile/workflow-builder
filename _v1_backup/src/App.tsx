import { ReactFlowProvider } from '@xyflow/react';
import TopBar from './components/TopBar';
import ShapeRail from './components/ShapeRail';
import FlowCanvas from './components/FlowCanvas';
import DetailsPanel from './components/DetailsPanel';

export default function App() {
  return (
    <ReactFlowProvider>
      <div className="app">
        <TopBar />
        <div className="workspace">
          <ShapeRail />
          <FlowCanvas />
          <DetailsPanel />
        </div>
      </div>
    </ReactFlowProvider>
  );
}
