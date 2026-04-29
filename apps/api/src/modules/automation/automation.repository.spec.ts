import { AutomationRepository } from './automation.repository';

describe('AutomationRepository', () => {
  const prisma = {
    automationRun: {
      create: jest.fn(),
      update: jest.fn(),
    },
    automationSignalExecution: {
      updateMany: jest.fn(),
    },
  } as any;

  const repository = new AutomationRepository(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('createAutomationRun writes a RUNNING run', async () => {
    prisma.automationRun.create.mockResolvedValue({
      id: 'run-1',
      userEmail: 'a@b.com',
      strategy: 'trend',
      status: 'RUNNING',
      startedAt: new Date(),
    });

    await repository.createAutomationRun({
      userEmail: 'a@b.com',
      strategy: 'trend',
    });

    expect(prisma.automationRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userEmail: 'a@b.com',
          strategy: 'trend',
          status: 'RUNNING',
        }),
      }),
    );
  });

  it('failAutomationRun sets FAILED status', async () => {
    prisma.automationRun.update.mockResolvedValue({});

    await repository.failAutomationRun({
      runId: 'run-1',
      notes: 'boom',
    });

    expect(prisma.automationRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run-1' },
        data: expect.objectContaining({
          status: 'FAILED',
          notes: 'boom',
        }),
      }),
    );
  });

  it('markSignalExecutionDuplicate updates duplicate status by key', async () => {
    prisma.automationSignalExecution.updateMany.mockResolvedValue({ count: 1 });

    await repository.markSignalExecutionDuplicate({
      runId: 'run-1',
      signalKey: 'k',
    });

    expect(prisma.automationSignalExecution.updateMany).toHaveBeenCalledWith({
      where: {
        runId: 'run-1',
        signalKey: 'k',
      },
      data: {
        status: 'SKIPPED_DUPLICATE',
        reason: 'duplicate signal',
      },
    });
  });
});
