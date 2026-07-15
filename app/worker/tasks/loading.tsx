import { SectionLoading } from "@/app/ui/loading";

export default function WorkerTasksLoading() {
  return <SectionLoading cards={3} rows={5} navigationScope="worker" />;
}
