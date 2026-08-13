"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type AlreadyRegisteredDialogProps = {
  open: boolean;
  mobile: string;
};

export function AlreadyRegisteredDialog({
  open,
  mobile,
}: AlreadyRegisteredDialogProps) {
  const router = useRouter();

  function goToLogin() {
    const params = new URLSearchParams();
    if (mobile.trim()) {
      params.set("mobile", mobile.trim());
    }
    const query = params.toString();
    router.push(query ? `/login?${query}` : "/login");
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Already Registered</DialogTitle>
          <DialogDescription>
            You&apos;re already registered with this mobile number.
            <br />
            <br />
            Please log in to continue.
          </DialogDescription>
        </DialogHeader>
        <Button type="button" className="w-full sm:w-auto" onClick={goToLogin}>
          Login
        </Button>
      </DialogContent>
    </Dialog>
  );
}
