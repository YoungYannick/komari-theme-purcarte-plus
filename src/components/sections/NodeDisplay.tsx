import { useState, useCallback } from "react";
import type { NodeData } from "@/types/node";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppConfig } from "@/config";
import { useLocale } from "@/config/hooks";
import Instance from "@/pages/instance/Instance";
import PingChart from "@/pages/instance/PingChart";
import { X } from "lucide-react";

interface NodeDetailModalProps {
  node: NodeData;
  onClose: () => void;
}

export const NodeDetailModal = ({ node, onClose }: NodeDetailModalProps) => {
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = useCallback(() => {
    setIsClosing(true);
  }, []);

  const handleAnimationEnd = useCallback(() => {
    if (isClosing) {
      setIsClosing(false);
      onClose();
    }
  }, [isClosing, onClose]);

  const { pingChartTimeInPreview, enableInstanceDetail, enablePingChart } =
    useAppConfig();
  const { t } = useLocale();

  return (
    <div
      className={`node-detail-overlay${isClosing ? " closing" : ""}`}
      onClick={handleClose}>
      <div
        className={`node-detail-modal purcarte-blur theme-card-style${isClosing ? " closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
        onAnimationEnd={handleAnimationEnd}>
        <div className="flex justify-between items-center mb-2 h-full">
          <h2 className="text-xl font-bold">
            {t("node.details", { name: node.name })}
          </h2>
          <button onClick={handleClose}>
            <X className="h-6 w-6" />
          </button>
        </div>
        <ScrollArea
          className="h-[calc(80vh-100px)]"
          viewportProps={{ className: "p-2" }}>
          <div className="space-y-4 @container">
            {enableInstanceDetail && node && <Instance node={node} />}
            {enablePingChart && (
              <PingChart node={node} hours={pingChartTimeInPreview} />
            )}
            {!enableInstanceDetail && !enablePingChart && (
              <div className="flex items-center justify-center h-[calc(80vh-132px)]">
                <div className="text-lg">
                  {t("homePage.noDetailsAvailable")}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};

interface NodeDisplayContainerProps {
  nodes: NodeData[];
  children: (node: NodeData, onShowDetails: () => void) => React.ReactNode;
}

export const NodeDisplayContainer = ({
  nodes,
  children,
}: NodeDisplayContainerProps) => {
  const [selectedNode, setSelectedNode] = useState<NodeData | null>(null);

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-4">
        {nodes.map((node) => children(node, () => setSelectedNode(node)))}
      </div>
      {selectedNode && (
        <NodeDetailModal
          node={selectedNode}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </>
  );
};
