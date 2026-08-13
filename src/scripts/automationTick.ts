import "dotenv/config";

import {
  AutomationService
} from "../services/AutomationService.js";

const service = new AutomationService();
const result = await service.tick();

console.log(JSON.stringify(result));
