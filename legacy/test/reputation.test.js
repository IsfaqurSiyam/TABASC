const ReputationContract = artifacts.require('ReputationContract');

contract('ReputationContract consumer reviews', (accounts) => {
  let reputation;

  beforeEach(async () => {
    reputation = await ReputationContract.new({ from: accounts[0] });
  });

  it('averages reviews across batches and records history by batch', async () => {
    await reputation.recordConsumerReview(
      accounts[1], 6, 'BATCH-1', 'consumer-1:BATCH-1', { from: accounts[0] }
    );
    await reputation.recordConsumerReview(
      accounts[1], 8, 'BATCH-2', 'consumer-1:BATCH-2', { from: accounts[0] }
    );

    const score = await reputation.getReputationScore(accounts[1]);
    assert.equal(score.feedbackScore.toString(), '7');
    assert.equal(score.finalScore.toString(), '520');
    assert.equal(score.totalBatches.toString(), '2');
    assert.equal((await reputation.getHistoryCount(accounts[1])).toString(), '2');
  });

  it('rejects recording the same consumer review twice', async () => {
    await reputation.recordConsumerReview(
      accounts[1], 6, 'BATCH-1', 'consumer-1:BATCH-1', { from: accounts[0] }
    );

    try {
      await reputation.recordConsumerReview(
        accounts[1], 9, 'BATCH-1', 'consumer-1:BATCH-1', { from: accounts[0] }
      );
      assert.fail('Expected the duplicate review to be rejected');
    } catch (error) {
      assert(error.message.includes('Review already recorded'));
    }
  });

  it('preserves the consumer average when an inspector updates a batch', async () => {
    await reputation.recordConsumerReview(
      accounts[1], 6, 'BATCH-1', 'consumer-1:BATCH-1', { from: accounts[0] }
    );
    await reputation.recordConsumerReview(
      accounts[1], 8, 'BATCH-2', 'consumer-1:BATCH-2', { from: accounts[0] }
    );
    await reputation.calculateAndUpdateScore(
      accounts[1], 9, 8, 7, 6, 1, 'BATCH-1', { from: accounts[0] }
    );

    const score = await reputation.getReputationScore(accounts[1]);
    assert.equal(score.feedbackScore.toString(), '7');
    assert.equal(score.finalScore.toString(), '770');
    assert.equal(score.totalBatches.toString(), '2');
  });
});