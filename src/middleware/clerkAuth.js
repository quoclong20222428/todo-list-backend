import { requireAuth } from "@clerk/backend";

export const clerkAuth = (handler) => {
  return async (req, res, next) => {
    try {
      const auth = await requireAuth(req);
      req.auth = auth; // gắn vào req để controller dùng req.auth.userId
      return handler(req, res, next);
    } catch (err) {
      return res.status(401).json({ message: "Unauthorized" });
    }
  };
};
