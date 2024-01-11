const { test, before, beforeEach } = require('tap');
const { $ } = require('zx');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const A9 = process.env.A9 || 'artillery';

before(async () => {
  await $`${A9} -V`;
});

beforeEach(async () => {
  $.verbose = true;
});

test('Run simple-bom', async (t) => {
  const output =
    await $`${A9} run-fargate ${__dirname}/fixtures/simple-bom/test.yml --environment test --region eu-west-1 --count 10`;

  t.equal(output.exitCode, 0, 'CLI Exit Code should be 0');

  t.match(output, /summary report/i, 'print summary report');
  t.match(output, /p99/i, 'a p99 value is reported');
  t.match(output, /created:.+100/i, 'expected number of vusers is reported');
});

test('Run mixed-hierarchy', async (t) => {
  const jsonReport = path.join(__dirname, `report-${Date.now()}.json`);
  const output =
    await $`${A9} run-fargate ${__dirname}/fixtures/mixed-hierarchy/scenarios/dino.yml --config ${__dirname}/fixtures/mixed-hierarchy/config/config.yml -e main --output ${jsonReport}`;

  const report = JSON.parse(fs.readFileSync(jsonReport, 'utf8'));

  t.equal(output.exitCode, 0, 'CLI Exit Code should be 0');

  t.equal(
    report.aggregate.counters['vusers.completed'],
    20,
    'Should have 20 total VUs'
  );
  t.equal(
    report.aggregate.counters['http.codes.200'],
    20,
    'Should have 20 "200 OK" responses'
  );
});

test('Run uses ensure', async (t) => {
  const jsonReport = path.join(__dirname, `report-${Date.now()}.json`);

  try {
    await $`${A9} run:fargate ${__dirname}/fixtures/uses-ensure/test.yaml --output ${jsonReport} --count 15`;
  } catch (output) {
    t.equal(output.exitCode, 1, 'CLI Exit Code should be 1');
    t.ok(
      output.stdout.includes(`${chalk.red('fail')}: http.response_time.p99 < 1`)
    );
    t.ok(output.stdout.includes(`${chalk.green('ok')}: p99 < 10000`));

    const report = JSON.parse(fs.readFileSync(jsonReport, 'utf8'));
    t.equal(
      report.aggregate.counters['vusers.completed'],
      300,
      'Should have 300 total VUs'
    );
    t.equal(
      report.aggregate.counters['http.codes.200'],
      300,
      'Should have 300 "200 OK" responses'
    );
  }
});

test('Ensure (with new interface) should still run when workers exit from expect plugin (non zero exit code)', async (t) => {
  //Note: this test uses new ensure plugin interface (config.plugins.ensure) to test that indirectly
  const jsonReport = path.join(__dirname, `report-${Date.now()}.json`);

  try {
    await $`${A9} run:fargate ${__dirname}/fixtures/cli-exit-conditions/with-expect-ensure.yml --output ${jsonReport} --count 2`;
  } catch (output) {
    t.equal(output.exitCode, 1, 'CLI Exit Code should be 1');
    t.ok(
      output.stdout.includes(`${chalk.red('fail')}: http.response_time.p95 < 1`)
    );
    t.ok(output.stdout.includes(`${chalk.green('ok')}: p99 < 10000`));

    const report = JSON.parse(fs.readFileSync(jsonReport, 'utf8'));
    t.equal(
      report.aggregate.counters['vusers.completed'],
      10,
      'Should have 10 total VUs'
    );
    t.equal(
      report.aggregate.counters['http.codes.200'],
      10,
      'Should have 10 "200 OK" responses'
    );
  }
});

test('CLI should exit with non-zero exit code when there are failed expectations in workers', async (t) => {
  const jsonReport = path.join(__dirname, `report-${Date.now()}.json`);

  try {
    await $`${A9} run-fargate ${__dirname}/fixtures/cli-exit-conditions/with-expect.yml --output ${jsonReport} --count 2`;
  } catch (output) {
    t.equal(output.exitCode, 6, 'CLI Exit Code should be 6');

    const report = JSON.parse(fs.readFileSync(jsonReport, 'utf8'));
    t.equal(
      report.aggregate.counters['vusers.completed'],
      10,
      'Should have 10 total VUs'
    );
    t.equal(
      report.aggregate.counters['http.codes.200'],
      10,
      'Should have 10 "200 OK" responses'
    );
  }
});

test('Kitchen Sink Test - multiple features together', async (t) => {
  const jsonReport = path.join(__dirname, `report-${Date.now()}.json`);

  const launchConfig = {
    environment: [
      { name: 'SECRET1', value: '/armadillo' },
      { name: 'SECRET2', value: '/pony' }
    ]
  };

  const output =
    await $`${A9} run-fargate ${__dirname}/fixtures/cli-kitchen-sink/scenario.yml --output ${jsonReport} --dotenv ${__dirname}/fixtures/cli-kitchen-sink/kitchen-sink-env --count 2 --launch-config ${JSON.stringify(
      launchConfig
    )}`;

  t.equal(output.exitCode, 0, 'CLI Exit Code should be 0');
  t.ok(
    output.stdout.includes(
      `${chalk.green('ok')}: http.response_time.p99 < 10000`
    )
  );
  t.ok(output.stdout.includes(`${chalk.green('ok')}: p99 < 10000`));

  const report = JSON.parse(fs.readFileSync(jsonReport, 'utf8'));
  t.equal(
    report.aggregate.counters['vusers.completed'],
    40,
    'Should have 40 total VUs'
  );
  t.equal(
    report.aggregate.counters['http.codes.200'],
    160,
    'Should have 160 "200 OK" responses'
  );

  // Check that each endpoint was hit correctly
  t.equal(
    report.aggregate.counters['plugins.metrics-by-endpoint./.codes.200'],
    40,
    'Should have 40 / "200 OK" responses'
  );
  t.equal(
    report.aggregate.counters['plugins.metrics-by-endpoint./dino.codes.200'],
    40,
    'Should have 40 /dino "200 OK" responses'
  );
  t.equal(
    report.aggregate.counters[
      'plugins.metrics-by-endpoint./armadillo.codes.200'
    ],
    40,
    'Should have 40 /armadillo "200 OK" responses'
  );
  t.equal(
    report.aggregate.counters['plugins.metrics-by-endpoint./pony.codes.200'],
    40,
    'Should have 40 /pony "200 OK" responses'
  );
});

test('Run lots-of-output', async (t) => {
  $.verbose = false; // we don't want megabytes of output on the console

  const output =
    await $`${A9} run:fargate ${__dirname}/fixtures/large-output/test.yml`;

  t.equal(output.exitCode, 0, 'CLI Exit Code should be 0');

  t.match(output.stdout, /summary report/i, 'print summary report');
  t.match(
    output.stdout,
    /very.very.long.name.for.a.histogram.metric.so.that.we.generate.a.lot.of.console.output/i,
    'includes custom metric output'
  );
  t.match(output.stdout, /p99/i, 'a p99 value is reported');
});

test('Run memory hog', async (t) => {
  try {
    await $`${A9} run-fargate ${__dirname}/fixtures/memory-hog/test.yml --region us-east-1 --launch-config '{"cpu":"4096", "memory":"12288"}'`;
  } catch (output) {
    t.equal(output.exitCode, 6, 'CLI Exit Code should be 6');

    t.match(output, /summary report/i, 'print summary report');
    t.match(output, /p99/i, 'a p99 value is reported');
  }
});
