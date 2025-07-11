class EmailProvider {
  constructor(name, failureRate = 0.3) {
    this.name = name;
    this.failureRate = failureRate;
  }

  async sendEmail(email) {
    if (Math.random() < this.failureRate) {
      throw new Error(`${this.name} failed to send email`);
    }
    return { success: true, provider: this.name };
  }
}

class RateLimiter {
  constructor(limit, intervalMs) {
    this.limit = limit;
    this.intervalMs = intervalMs;
    this.timestamps = [];
  }

  isAllowed() {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(ts => now - ts < this.intervalMs);
    if (this.timestamps.length < this.limit) {
      this.timestamps.push(now);
      return true;
    }
    return false;
  }
}

class EmailService {
  constructor(provider1, provider2, maxRetries = 3) {
    this.providers = [provider1, provider2];
    this.maxRetries = maxRetries;
    this.sentEmails = new Set(); 
    this.statusMap = new Map();  
    this.rateLimiter = new RateLimiter(5, 10000); 
  }

  async send(emailId, emailData) {
  if (this.sentEmails.has(emailId)) {
    console.log(`[INFO] Email "${emailId}" already sent. Skipping (idempotent).`);
    return this.statusMap.get(emailId);
  }

  if (!this.rateLimiter.isAllowed()) {
    console.warn(`[WARN] Rate limit exceeded. Email "${emailId}" not sent.`);
    const status = { status: 'rate_limited', attempts: 0 };
    this.statusMap.set(emailId, status);
    return status;
  }

  for (let i = 0; i < this.providers.length; i++) {
    const provider = this.providers[i];
    let attempts = 0;
    let delay = 100;

    console.log(`[INFO] Attempting to send "${emailId}" using ${provider.name}`);

    while (attempts < this.maxRetries) {
      try {
        const result = await provider.sendEmail(emailData);
        console.log(`[SUCCESS] Email "${emailId}" sent via ${result.provider} in ${attempts + 1} attempt(s).`);
        const status = {
          status: 'sent',
          provider: result.provider,
          attempts: attempts + 1
        };
        this.sentEmails.add(emailId);
        this.statusMap.set(emailId, status);
        return status;
      } catch (err) {
        attempts++;
        console.error(`[ERROR] Attempt ${attempts} failed using ${provider.name}: ${err.message}`);
        console.log(`[INFO] Retrying in ${delay}ms...`);
        await new Promise(res => setTimeout(res, delay));
        delay *= 2;
      }
    }

    console.warn(`[WARN] All retries failed for ${provider.name}.`);
    console.log(`[INFO] Trying next provider...`);
  }

  console.error(`[FAIL] Email "${emailId}" failed with all providers.`);
  const failureStatus = {
    status: 'failed',
    attempts: this.maxRetries * this.providers.length
  };
  this.statusMap.set(emailId, failureStatus);
  return failureStatus;
}

  getStatus(emailId) {
    return this.statusMap.get(emailId) || { status: 'unknown' };
  }
}

// Unit tests
(async () => {
  const provider1 = new EmailProvider("MockProvider1", 0.7); 
  const provider2 = new EmailProvider("MockProvider2", 0.5); 
  const emailService = new EmailService(provider1, provider2);

  console.log("Test 1: Successful email send");
  console.log(await emailService.send("email-1", { to: "a@test.com", body: "Hello" }));

  console.log("Test 2: Retry and fallback");
  console.log(await emailService.send("email-2", { to: "b@test.com", body: "Retry test" }));

  console.log("Test 3: Idempotency");
  console.log(await emailService.send("email-1", { to: "a@test.com", body: "Duplicate" }));

  console.log("Test 4: Rate limiting");
  for (let i = 3; i <= 8; i++) {
    console.log(await emailService.send(`email-${i}`, { to: `user${i}@test.com`, body: "Rate limit" }));
  }

  console.log("Test 5: Status tracking");
  console.log(emailService.getStatus("email-1"));
  console.log(emailService.getStatus("email-100")); 
})();
