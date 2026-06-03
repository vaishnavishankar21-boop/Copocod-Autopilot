import http from "http";

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  const { method, url } = req;
  console.log(`[Mock Server] Received ${method} ${url}`);

  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Content-Type", "application/json");

  if (method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });

  req.on("end", () => {
    try {
      const parsedBody = body ? JSON.parse(body) : {};

      // 1. Commit Action
      if (method === "POST" && url === "/v1/actions/commit") {
        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        res.writeHead(200);
        res.end(
          JSON.stringify({
            commitId: `COMMIT-${randomSuffix}`,
            status: "Completed Successfully",
            filesCommitted: ["LeadScoring.cls", "LeadScoringTest.cls"],
          })
        );
        return;
      }

      // 2. Promote / Validate Action
      if (method === "POST" && (url === "/v1/actions/promote" || url === "/v1/actions/validate")) {
        const action = url.split("/").pop();
        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        res.writeHead(200);
        res.end(
          JSON.stringify({
            promotionId: `PROM-${randomSuffix}`,
            jobExecutionId: `JOB-${randomSuffix}`,
            status: "In Progress",
            environment: parsedBody.environment || "UAT",
            validateOnly: action === "validate",
          })
        );
        return;
      }

      // 3. Revert Action
      if (method === "POST" && url === "/v1/actions/revert") {
        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        res.writeHead(200);
        res.end(
          JSON.stringify({
            revertId: `REVERT-${randomSuffix}`,
            jobExecutionId: `REVERT-${randomSuffix}`,
            status: "In Progress",
            environment: parsedBody.environment || "UAT",
            revertedDeploymentId: parsedBody.jobExecutionId || `JOB-${randomSuffix}`,
          })
        );
        return;
      }

      // 4. Job Status
      if (method === "GET" && url?.startsWith("/v1/job-executions/")) {
        const jobId = url.split("/").pop();
        res.writeHead(200);
        res.end(
          JSON.stringify({
            jobExecutionId: jobId,
            status: "Completed Successfully",
          })
        );
        return;
      }

      // 5. Trigger CRT Job
      // Pattern: /pace/v4/projects/:projectId/jobs/:jobId/builds
      if (method === "POST" && url?.match(/^\/pace\/v4\/projects\/[^/]+\/jobs\/[^/]+\/builds$/)) {
        const parts = url.split("/");
        const projectId = parts[4];
        const jobId = parts[6];
        const randomSuffix = Math.floor(1000 + Math.random() * 9000);

        res.writeHead(200);
        res.end(
          JSON.stringify({
            executionId: `EXEC-${randomSuffix}`,
            status: "In Progress",
            projectId: projectId,
            jobId: jobId,
          })
        );
        return;
      }

      // 6. Get CRT Job Status
      // Pattern: /pace/v4/projects/:projectId/jobs/:jobId/builds/:executionId
      if (method === "GET" && url?.match(/^\/pace\/v4\/projects\/[^/]+\/jobs\/[^/]+\/builds\/[^/]+$/)) {
        const parts = url.split("/");
        const executionId = parts[8];

        res.writeHead(200);
        res.end(
          JSON.stringify({
            executionId: executionId,
            status: "Succeeded",
          })
        );
        return;
      }

      // 7. Get CRT Job Results
      // Pattern: /pace/v4/projects/:projectId/jobs/:jobId/builds/:executionId/results
      if (method === "GET" && url?.match(/^\/pace\/v4\/projects\/[^/]+\/jobs\/[^/]+\/builds\/[^/]+\/results$/)) {
        const parts = url.split("/");
        const executionId = parts[8];

        res.writeHead(200);
        res.end(
          JSON.stringify({
            executionId: executionId,
            testResult: "Succeeded",
          })
        );
        return;
      }

      // Default: Not found
      res.writeHead(404);
      res.end(JSON.stringify({ error: "NOT_FOUND", message: `Endpoint ${method} ${url} not found` }));
    } catch (err: any) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: "INTERNAL_ERROR", message: err.message }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`[Mock Server] Running at http://localhost:${PORT}`);
});
