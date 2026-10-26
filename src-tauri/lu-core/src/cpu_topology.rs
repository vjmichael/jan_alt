//! CPU topology and conservative worker budget; independent of GPU discovery.
//! available_parallelism reflects process affinity / OS restrictions when available.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CpuTopology {
    pub available_logical_threads: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CpuWorkload {
    Interactive,
    Background,
    DedicatedBenchmark,
}

impl CpuTopology {
    pub fn discover() -> Self {
        Self {
            available_logical_threads: std::thread::available_parallelism()
                .map(|threads| threads.get())
                .unwrap_or(1),
        }
    }

    pub fn worker_budget(&self, workload: CpuWorkload, requested: Option<usize>) -> usize {
        let available = self.available_logical_threads.max(1);
        let default = match workload {
            CpuWorkload::Interactive => available.saturating_sub(1).max(1),
            CpuWorkload::Background => (available / 2).max(1),
            CpuWorkload::DedicatedBenchmark => available,
        };
        requested.unwrap_or(default).clamp(1, available)
    }
}
