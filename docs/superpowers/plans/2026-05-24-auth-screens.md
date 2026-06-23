# Auth Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build all three auth screens (Login, Register, Forgot Password) with hooks, form components, and route screens wired to Firebase Auth and Firestore.

**Architecture:** Feature hooks handle Firebase calls and store updates; form components own field state and validation; route screens are thin shells that wrap forms in a `Screen` layout. The `useAuth` listener in `_layout.tsx` already handles redirecting returning users — `useLogin` just calls `signIn()` and lets the listener do its job. `useRegister` writes the user doc before `onAuthStateChanged` fires, then updates `authStore` directly to avoid a race.

**Tech Stack:** Expo Router, Firebase Auth, Firestore, Zustand, React Native, Jest + jest-expo, @testing-library/react-native

---

## File Map

| Status | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/core/firebase/auth.ts` | Add `sendPasswordResetEmail` |
| Modify | `src/core/stores/uiStore.ts` | Add `isNewProfessional` + `setNewProfessional` |
| Modify | `src/core/stores/__tests__/uiStore.test.ts` | Cover new state |
| Create | `src/features/auth/hooks/useLogin.ts` | signIn → error/loading state |
| Create | `src/features/auth/hooks/useRegister.ts` | signUp → write doc → authStore → redirect |
| Create | `src/features/auth/hooks/useForgotPassword.ts` | sendPasswordResetEmail → sent state |
| Create | `src/features/auth/hooks/__tests__/useLogin.test.ts` | Hook tests |
| Create | `src/features/auth/hooks/__tests__/useRegister.test.ts` | Hook tests |
| Create | `src/features/auth/hooks/__tests__/useForgotPassword.test.ts` | Hook tests |
| Create | `src/features/auth/components/RoleSelector.tsx` | Segmented control: Client \| Professional |
| Create | `src/features/auth/components/LoginForm.tsx` | Email + password + links |
| Create | `src/features/auth/components/RegisterForm.tsx` | Full name + email + password + RoleSelector |
| Create | `src/features/auth/components/ForgotPasswordForm.tsx` | Email + sent confirmation state |
| Modify | `src/features/auth/hooks/index.ts` | Barrel export hooks |
| Modify | `src/features/auth/components/index.ts` | Barrel export components |
| Modify | `src/app/(auth)/index.tsx` | Replace placeholder with LoginForm |
| Create | `src/app/(auth)/register.tsx` | Thin shell: RegisterForm |
| Create | `src/app/(auth)/forgot-password.tsx` | Thin shell: ForgotPasswordForm |

---

## Task 1: Install test dependency + add `sendPasswordResetEmail` to firebase/auth

**Files:**
- Modify: `src/core/firebase/auth.ts`

- [ ] **Step 1: Install @testing-library/react-native**

```bash
npm install --save-dev @testing-library/react-native
```

Expected: package installed, no errors.

- [ ] **Step 2: Add `sendPasswordResetEmail` to `src/core/firebase/auth.ts`**

Replace the full file content:

```typescript
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth } from './config';

export async function signUp(email: string, password: string): Promise<FirebaseUser> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function signIn(email: string, password: string): Promise<FirebaseUser> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}

export async function sendPasswordResetEmail(email: string): Promise<void> {
  await firebaseSendPasswordResetEmail(auth, email);
}

export function onAuthChange(callback: (user: FirebaseUser | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/core/firebase/auth.ts package.json package-lock.json
git commit -m "feat: add sendPasswordResetEmail to firebase/auth"
```

---

## Task 2: Add `isNewProfessional` to `uiStore`

**Files:**
- Modify: `src/core/stores/uiStore.ts`
- Modify: `src/core/stores/__tests__/uiStore.test.ts`

- [ ] **Step 1: Write the failing tests**

Add these cases to `src/core/stores/__tests__/uiStore.test.ts`:

```typescript
import { useUiStore } from '../uiStore';

beforeEach(() => {
  useUiStore.setState({ isLoading: false, toasts: [], isNewProfessional: false });
});

// ... keep all existing tests unchanged, then add:

describe('isNewProfessional', () => {
  it('defaults to false', () => {
    expect(useUiStore.getState().isNewProfessional).toBe(false);
  });

  it('setNewProfessional sets it to true', () => {
    useUiStore.getState().setNewProfessional(true);
    expect(useUiStore.getState().isNewProfessional).toBe(true);
  });

  it('setNewProfessional sets it back to false', () => {
    useUiStore.getState().setNewProfessional(true);
    useUiStore.getState().setNewProfessional(false);
    expect(useUiStore.getState().isNewProfessional).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest src/core/stores/__tests__/uiStore.test.ts --no-coverage
```

Expected: FAIL — `setNewProfessional is not a function`

- [ ] **Step 3: Update `src/core/stores/uiStore.ts`**

Replace the full file:

```typescript
import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info';

export type Toast = {
  id: string;
  message: string;
  type: ToastType;
};

type UiState = {
  isLoading: boolean;
  toasts: Toast[];
  isNewProfessional: boolean;
  setLoading: (loading: boolean) => void;
  showToast: (message: string, type?: ToastType) => void;
  dismissToast: (id: string) => void;
  setNewProfessional: (val: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  isLoading: false,
  toasts: [],
  isNewProfessional: false,
  setLoading: (isLoading) => set({ isLoading }),
  showToast: (message, type = 'info') =>
    set((state) => ({
      toasts: [
        ...state.toasts,
        { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, message, type },
      ],
    })),
  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
  setNewProfessional: (isNewProfessional) => set({ isNewProfessional }),
}));
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest src/core/stores/__tests__/uiStore.test.ts --no-coverage
```

Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/core/stores/uiStore.ts src/core/stores/__tests__/uiStore.test.ts
git commit -m "feat: add isNewProfessional to uiStore"
```

---

## Task 3: Implement `useLogin` hook

**Files:**
- Create: `src/features/auth/hooks/useLogin.ts`
- Create: `src/features/auth/hooks/__tests__/useLogin.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/features/auth/hooks/__tests__/useLogin.test.ts`:

```typescript
import { renderHook, act } from '@testing-library/react-native';
import { useLogin } from '../useLogin';
import { signIn } from '@core/firebase/auth';
import { useUiStore } from '@core/stores/uiStore';

jest.mock('@core/firebase/auth', () => ({
  signIn: jest.fn(),
}));

const mockSignIn = signIn as jest.MockedFunction<typeof signIn>;

beforeEach(() => {
  jest.clearAllMocks();
  useUiStore.setState({ isLoading: false, toasts: [], isNewProfessional: false });
});

describe('useLogin', () => {
  it('calls signIn with email and password', async () => {
    mockSignIn.mockResolvedValue({ uid: 'u1' } as any);
    const { result } = renderHook(() => useLogin());
    await act(async () => {
      await result.current.login('test@example.com', 'password123');
    });
    expect(mockSignIn).toHaveBeenCalledWith('test@example.com', 'password123');
  });

  it('sets isLoading to false after success', async () => {
    mockSignIn.mockResolvedValue({ uid: 'u1' } as any);
    const { result } = renderHook(() => useLogin());
    await act(async () => {
      await result.current.login('test@example.com', 'password123');
    });
    expect(result.current.isLoading).toBe(false);
  });

  it('sets error on invalid-credential', async () => {
    mockSignIn.mockRejectedValue({ code: 'auth/invalid-credential' });
    const { result } = renderHook(() => useLogin());
    await act(async () => {
      await result.current.login('test@example.com', 'wrong');
    });
    expect(result.current.error).toBe('Invalid email or password.');
  });

  it('sets error on too-many-requests', async () => {
    mockSignIn.mockRejectedValue({ code: 'auth/too-many-requests' });
    const { result } = renderHook(() => useLogin());
    await act(async () => {
      await result.current.login('test@example.com', 'wrong');
    });
    expect(result.current.error).toBe('Too many attempts. Try again later.');
  });

  it('shows an error toast on failure', async () => {
    mockSignIn.mockRejectedValue({ code: 'auth/invalid-credential' });
    const { result } = renderHook(() => useLogin());
    await act(async () => {
      await result.current.login('test@example.com', 'wrong');
    });
    const toasts = useUiStore.getState().toasts;
    expect(toasts[0].message).toBe('Invalid email or password.');
    expect(toasts[0].type).toBe('error');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest src/features/auth/hooks/__tests__/useLogin.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../useLogin'`

- [ ] **Step 3: Create `src/features/auth/hooks/useLogin.ts`**

```typescript
import { useState } from 'react';
import { signIn } from '@core/firebase/auth';
import { useUiStore } from '@core/stores/uiStore';

type LoginState = {
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
};

export function useLogin(): LoginState {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showToast = useUiStore((s) => s.showToast);

  async function login(email: string, password: string) {
    setError(null);
    setIsLoading(true);
    try {
      await signIn(email, password);
    } catch (e: any) {
      const msg = toLoginError(e.code);
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  }

  return { isLoading, error, login };
}

function toLoginError(code: string): string {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Try again later.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest src/features/auth/hooks/__tests__/useLogin.test.ts --no-coverage
```

Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/features/auth/hooks/useLogin.ts src/features/auth/hooks/__tests__/useLogin.test.ts
git commit -m "feat: add useLogin hook"
```

---

## Task 4: Implement `useRegister` hook

**Files:**
- Create: `src/features/auth/hooks/useRegister.ts`
- Create: `src/features/auth/hooks/__tests__/useRegister.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/features/auth/hooks/__tests__/useRegister.test.ts`:

```typescript
import { renderHook, act } from '@testing-library/react-native';
import { useRegister } from '../useRegister';
import { signUp } from '@core/firebase/auth';
import { setDocument } from '@core/firebase/firestore';
import { useAuthStore } from '@core/stores/authStore';
import { useUiStore } from '@core/stores/uiStore';

jest.mock('@core/firebase/auth', () => ({
  signUp: jest.fn(),
}));

jest.mock('@core/firebase/firestore', () => ({
  setDocument: jest.fn(),
}));

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const mockSignUp = signUp as jest.MockedFunction<typeof signUp>;
const mockSetDocument = setDocument as jest.MockedFunction<typeof setDocument>;

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: null, role: null, isLoading: false });
  useUiStore.setState({ isLoading: false, toasts: [], isNewProfessional: false });
});

describe('useRegister', () => {
  it('calls signUp then setDocument with correct user doc', async () => {
    mockSignUp.mockResolvedValue({ uid: 'u1' } as any);
    mockSetDocument.mockResolvedValue(undefined);
    const { result } = renderHook(() => useRegister());
    await act(async () => {
      await result.current.register('John Doe', 'john@example.com', 'password123', 'client');
    });
    expect(mockSignUp).toHaveBeenCalledWith('john@example.com', 'password123');
    expect(mockSetDocument).toHaveBeenCalledWith(
      'users/u1',
      expect.objectContaining({
        id: 'u1',
        email: 'john@example.com',
        displayName: 'John Doe',
        role: 'client',
        photoURL: null,
      })
    );
  });

  it('updates authStore user and role on success', async () => {
    mockSignUp.mockResolvedValue({ uid: 'u1' } as any);
    mockSetDocument.mockResolvedValue(undefined);
    const { result } = renderHook(() => useRegister());
    await act(async () => {
      await result.current.register('John Doe', 'john@example.com', 'password123', 'client');
    });
    expect(useAuthStore.getState().user?.id).toBe('u1');
    expect(useAuthStore.getState().role).toBe('client');
  });

  it('redirects client to browse', async () => {
    mockSignUp.mockResolvedValue({ uid: 'u1' } as any);
    mockSetDocument.mockResolvedValue(undefined);
    const { result } = renderHook(() => useRegister());
    await act(async () => {
      await result.current.register('Jane', 'jane@example.com', 'password123', 'client');
    });
    expect(mockReplace).toHaveBeenCalledWith('/(client)/(tabs)/browse/');
  });

  it('sets isNewProfessional and redirects professional to profile', async () => {
    mockSignUp.mockResolvedValue({ uid: 'u1' } as any);
    mockSetDocument.mockResolvedValue(undefined);
    const { result } = renderHook(() => useRegister());
    await act(async () => {
      await result.current.register('Pro User', 'pro@example.com', 'password123', 'professional');
    });
    expect(useUiStore.getState().isNewProfessional).toBe(true);
    expect(mockReplace).toHaveBeenCalledWith('/(professional)/(tabs)/profile/');
  });

  it('sets error on email-already-in-use', async () => {
    mockSignUp.mockRejectedValue({ code: 'auth/email-already-in-use' });
    const { result } = renderHook(() => useRegister());
    await act(async () => {
      await result.current.register('John', 'john@example.com', 'password123', 'client');
    });
    expect(result.current.error).toBe('An account with this email already exists.');
  });

  it('sets isLoading to false after error', async () => {
    mockSignUp.mockRejectedValue({ code: 'auth/email-already-in-use' });
    const { result } = renderHook(() => useRegister());
    await act(async () => {
      await result.current.register('John', 'john@example.com', 'password123', 'client');
    });
    expect(result.current.isLoading).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest src/features/auth/hooks/__tests__/useRegister.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../useRegister'`

- [ ] **Step 3: Create `src/features/auth/hooks/useRegister.ts`**

```typescript
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { signUp } from '@core/firebase/auth';
import { setDocument } from '@core/firebase/firestore';
import { useAuthStore } from '@core/stores/authStore';
import { useUiStore } from '@core/stores/uiStore';
import type { UserRole } from '@core/types/user';

type RegisterState = {
  isLoading: boolean;
  error: string | null;
  register: (fullName: string, email: string, password: string, role: UserRole) => Promise<void>;
};

export function useRegister(): RegisterState {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { setUser, setRole } = useAuthStore();
  const { showToast, setNewProfessional } = useUiStore();

  async function register(fullName: string, email: string, password: string, role: UserRole) {
    setError(null);
    setIsLoading(true);
    try {
      const firebaseUser = await signUp(email, password);
      const userData = {
        id: firebaseUser.uid,
        email,
        displayName: fullName,
        photoURL: null,
        role,
        createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
      };
      await setDocument(`users/${firebaseUser.uid}`, userData);
      setUser(userData);
      setRole(role);
      if (role === 'professional') {
        setNewProfessional(true);
        router.replace('/(professional)/(tabs)/profile/');
      } else {
        router.replace('/(client)/(tabs)/browse/');
      }
    } catch (e: any) {
      const msg = toRegisterError(e.code);
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  }

  return { isLoading, error, register };
}

function toRegisterError(code: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest src/features/auth/hooks/__tests__/useRegister.test.ts --no-coverage
```

Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/features/auth/hooks/useRegister.ts src/features/auth/hooks/__tests__/useRegister.test.ts
git commit -m "feat: add useRegister hook"
```

---

## Task 5: Implement `useForgotPassword` hook

**Files:**
- Create: `src/features/auth/hooks/useForgotPassword.ts`
- Create: `src/features/auth/hooks/__tests__/useForgotPassword.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/features/auth/hooks/__tests__/useForgotPassword.test.ts`:

```typescript
import { renderHook, act } from '@testing-library/react-native';
import { useForgotPassword } from '../useForgotPassword';
import { sendPasswordResetEmail } from '@core/firebase/auth';
import { useUiStore } from '@core/stores/uiStore';

jest.mock('@core/firebase/auth', () => ({
  sendPasswordResetEmail: jest.fn(),
}));

const mockSend = sendPasswordResetEmail as jest.MockedFunction<typeof sendPasswordResetEmail>;

beforeEach(() => {
  jest.clearAllMocks();
  useUiStore.setState({ isLoading: false, toasts: [], isNewProfessional: false });
});

describe('useForgotPassword', () => {
  it('calls sendPasswordResetEmail with the email', async () => {
    mockSend.mockResolvedValue(undefined);
    const { result } = renderHook(() => useForgotPassword());
    await act(async () => {
      await result.current.sendReset('test@example.com');
    });
    expect(mockSend).toHaveBeenCalledWith('test@example.com');
  });

  it('sets sent to true on success', async () => {
    mockSend.mockResolvedValue(undefined);
    const { result } = renderHook(() => useForgotPassword());
    await act(async () => {
      await result.current.sendReset('test@example.com');
    });
    expect(result.current.sent).toBe(true);
  });

  it('sets isLoading to false after success', async () => {
    mockSend.mockResolvedValue(undefined);
    const { result } = renderHook(() => useForgotPassword());
    await act(async () => {
      await result.current.sendReset('test@example.com');
    });
    expect(result.current.isLoading).toBe(false);
  });

  it('sets error on user-not-found', async () => {
    mockSend.mockRejectedValue({ code: 'auth/user-not-found' });
    const { result } = renderHook(() => useForgotPassword());
    await act(async () => {
      await result.current.sendReset('notfound@example.com');
    });
    expect(result.current.error).toBe('No account found with this email.');
  });

  it('shows error toast on failure', async () => {
    mockSend.mockRejectedValue({ code: 'auth/user-not-found' });
    const { result } = renderHook(() => useForgotPassword());
    await act(async () => {
      await result.current.sendReset('notfound@example.com');
    });
    expect(useUiStore.getState().toasts[0].type).toBe('error');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest src/features/auth/hooks/__tests__/useForgotPassword.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../useForgotPassword'`

- [ ] **Step 3: Create `src/features/auth/hooks/useForgotPassword.ts`**

```typescript
import { useState } from 'react';
import { sendPasswordResetEmail } from '@core/firebase/auth';
import { useUiStore } from '@core/stores/uiStore';

type ForgotPasswordState = {
  isLoading: boolean;
  sent: boolean;
  error: string | null;
  sendReset: (email: string) => Promise<void>;
};

export function useForgotPassword(): ForgotPasswordState {
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showToast = useUiStore((s) => s.showToast);

  async function sendReset(email: string) {
    setError(null);
    setIsLoading(true);
    try {
      await sendPasswordResetEmail(email);
      setSent(true);
    } catch (e: any) {
      const msg =
        e.code === 'auth/user-not-found'
          ? 'No account found with this email.'
          : 'Something went wrong. Please try again.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  }

  return { isLoading, sent, error, sendReset };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest src/features/auth/hooks/__tests__/useForgotPassword.test.ts --no-coverage
```

Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/features/auth/hooks/useForgotPassword.ts src/features/auth/hooks/__tests__/useForgotPassword.test.ts
git commit -m "feat: add useForgotPassword hook"
```

---

## Task 6: Build `RoleSelector` component

**Files:**
- Create: `src/features/auth/components/RoleSelector.tsx`

- [ ] **Step 1: Create `src/features/auth/components/RoleSelector.tsx`**

```typescript
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { UserRole } from '@core/types/user';

type RoleSelectorProps = {
  value: UserRole;
  onChange: (role: UserRole) => void;
};

export function RoleSelector({ value, onChange }: RoleSelectorProps) {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.option, value === 'client' && styles.active]}
        onPress={() => onChange('client')}
        activeOpacity={0.8}
      >
        <Text style={[styles.label, value === 'client' && styles.activeLabel]}>Client</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.option, value === 'professional' && styles.active]}
        onPress={() => onChange('professional')}
        activeOpacity={0.8}
      >
        <Text style={[styles.label, value === 'professional' && styles.activeLabel]}>
          Professional
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    overflow: 'hidden',
  },
  option: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: '#fff' },
  active: { backgroundColor: '#000' },
  label: { fontSize: 14, fontWeight: '500', color: '#333' },
  activeLabel: { color: '#fff' },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/features/auth/components/RoleSelector.tsx
git commit -m "feat: add RoleSelector component"
```

---

## Task 7: Build `LoginForm` + update login screen

**Files:**
- Create: `src/features/auth/components/LoginForm.tsx`
- Modify: `src/app/(auth)/index.tsx`

- [ ] **Step 1: Create `src/features/auth/components/LoginForm.tsx`**

```typescript
import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Input } from '@components/ui/Input';
import { Button } from '@components/ui/Button';
import { useLogin } from '@features/auth/hooks/useLogin';
import { isValidEmail, isNonEmpty } from '@utils/validators';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const { isLoading, login } = useLogin();
  const router = useRouter();

  function validate(): boolean {
    const errors: { email?: string; password?: string } = {};
    if (!isValidEmail(email)) errors.email = 'Enter a valid email.';
    if (!isNonEmpty(password)) errors.password = 'Password is required.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    await login(email, password);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign In</Text>
      <Input
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        error={fieldErrors.email}
      />
      <Input
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        error={fieldErrors.password}
      />
      <TouchableOpacity onPress={() => router.push('/(auth)/forgot-password')}>
        <Text style={styles.link}>Forgot password?</Text>
      </TouchableOpacity>
      <Button label="Sign In" onPress={handleSubmit} disabled={isLoading} />
      <View style={styles.footer}>
        <Text style={styles.footerText}>Don't have an account? </Text>
        <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
          <Text style={styles.link}>Register</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 16 },
  title: { fontSize: 28, fontWeight: '700', color: '#000', marginBottom: 8 },
  link: { fontSize: 14, color: '#000', fontWeight: '500', textDecorationLine: 'underline' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 8 },
  footerText: { fontSize: 14, color: '#666' },
});
```

- [ ] **Step 2: Replace `src/app/(auth)/index.tsx`**

```typescript
import { Screen } from '@components/layout/Screen';
import { LoginForm } from '@features/auth/components/LoginForm';

export default function LoginScreen() {
  return (
    <Screen>
      <LoginForm />
    </Screen>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/features/auth/components/LoginForm.tsx src/app/(auth)/index.tsx
git commit -m "feat: build LoginForm and wire login screen"
```

---

## Task 8: Build `RegisterForm` + register screen

**Files:**
- Create: `src/features/auth/components/RegisterForm.tsx`
- Create: `src/app/(auth)/register.tsx`

- [ ] **Step 1: Create `src/features/auth/components/RegisterForm.tsx`**

```typescript
import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Input } from '@components/ui/Input';
import { Button } from '@components/ui/Button';
import { RoleSelector } from './RoleSelector';
import { useRegister } from '@features/auth/hooks/useRegister';
import { isValidEmail, isNonEmpty } from '@utils/validators';
import type { UserRole } from '@core/types/user';

export function RegisterForm() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('client');
  const [fieldErrors, setFieldErrors] = useState<{
    fullName?: string;
    email?: string;
    password?: string;
  }>({});
  const { isLoading, register } = useRegister();
  const router = useRouter();

  function validate(): boolean {
    const errors: { fullName?: string; email?: string; password?: string } = {};
    if (!isNonEmpty(fullName)) errors.fullName = 'Full name is required.';
    if (!isValidEmail(email)) errors.email = 'Enter a valid email.';
    if (password.length < 6) errors.password = 'Password must be at least 6 characters.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    await register(fullName, email, password, role);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Account</Text>
      <Input
        label="Full Name"
        value={fullName}
        onChangeText={setFullName}
        autoCapitalize="words"
        error={fieldErrors.fullName}
      />
      <Input
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        error={fieldErrors.email}
      />
      <Input
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        error={fieldErrors.password}
      />
      <View style={styles.roleRow}>
        <Text style={styles.roleLabel}>I am a</Text>
        <RoleSelector value={role} onChange={setRole} />
      </View>
      <Button label="Create Account" onPress={handleSubmit} disabled={isLoading} />
      <View style={styles.footer}>
        <Text style={styles.footerText}>Already have an account? </Text>
        <TouchableOpacity onPress={() => router.push('/(auth)/')}>
          <Text style={styles.link}>Sign In</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 16 },
  title: { fontSize: 28, fontWeight: '700', color: '#000', marginBottom: 8 },
  roleRow: { gap: 8 },
  roleLabel: { fontSize: 14, fontWeight: '500', color: '#333' },
  link: { fontSize: 14, color: '#000', fontWeight: '500', textDecorationLine: 'underline' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 8 },
  footerText: { fontSize: 14, color: '#666' },
});
```

- [ ] **Step 2: Create `src/app/(auth)/register.tsx`**

```typescript
import { Screen } from '@components/layout/Screen';
import { RegisterForm } from '@features/auth/components/RegisterForm';

export default function RegisterScreen() {
  return (
    <Screen>
      <RegisterForm />
    </Screen>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/features/auth/components/RegisterForm.tsx src/app/(auth)/register.tsx
git commit -m "feat: build RegisterForm and register screen"
```

---

## Task 9: Build `ForgotPasswordForm` + forgot-password screen

**Files:**
- Create: `src/features/auth/components/ForgotPasswordForm.tsx`
- Create: `src/app/(auth)/forgot-password.tsx`

- [ ] **Step 1: Create `src/features/auth/components/ForgotPasswordForm.tsx`**

```typescript
import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Input } from '@components/ui/Input';
import { Button } from '@components/ui/Button';
import { useForgotPassword } from '@features/auth/hooks/useForgotPassword';
import { isValidEmail } from '@utils/validators';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const { isLoading, sent, sendReset } = useForgotPassword();
  const router = useRouter();

  function validate(): boolean {
    if (!isValidEmail(email)) {
      setEmailError('Enter a valid email.');
      return false;
    }
    setEmailError(undefined);
    return true;
  }

  async function handleSubmit() {
    if (!validate()) return;
    await sendReset(email);
  }

  if (sent) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Check your inbox</Text>
        <Text style={styles.body}>We sent a password reset link to {email}.</Text>
        <TouchableOpacity onPress={() => router.replace('/(auth)/')}>
          <Text style={styles.link}>Back to login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Reset Password</Text>
      <Text style={styles.body}>Enter your email and we'll send you a reset link.</Text>
      <Input
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        error={emailError}
      />
      <Button label="Send reset link" onPress={handleSubmit} disabled={isLoading} />
      <TouchableOpacity onPress={() => router.replace('/(auth)/')}>
        <Text style={styles.link}>Back to login</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 16 },
  title: { fontSize: 28, fontWeight: '700', color: '#000', marginBottom: 8 },
  body: { fontSize: 15, color: '#666', lineHeight: 22 },
  link: { fontSize: 14, color: '#000', fontWeight: '500', textDecorationLine: 'underline' },
});
```

- [ ] **Step 2: Create `src/app/(auth)/forgot-password.tsx`**

```typescript
import { Screen } from '@components/layout/Screen';
import { ForgotPasswordForm } from '@features/auth/components/ForgotPasswordForm';

export default function ForgotPasswordScreen() {
  return (
    <Screen>
      <ForgotPasswordForm />
    </Screen>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/features/auth/components/ForgotPasswordForm.tsx src/app/(auth)/forgot-password.tsx
git commit -m "feat: build ForgotPasswordForm and forgot-password screen"
```

---

## Task 10: Update barrel exports + run full test suite

**Files:**
- Modify: `src/features/auth/hooks/index.ts`
- Modify: `src/features/auth/components/index.ts`

- [ ] **Step 1: Update `src/features/auth/hooks/index.ts`**

```typescript
export { useLogin } from './useLogin';
export { useRegister } from './useRegister';
export { useForgotPassword } from './useForgotPassword';
```

- [ ] **Step 2: Update `src/features/auth/components/index.ts`**

```typescript
export { LoginForm } from './LoginForm';
export { RegisterForm } from './RegisterForm';
export { ForgotPasswordForm } from './ForgotPasswordForm';
export { RoleSelector } from './RoleSelector';
```

- [ ] **Step 3: Run full test suite**

```bash
npx jest --no-coverage
```

Expected: all tests pass (uiStore, authStore, validators, formatters, useLogin, useRegister, useForgotPassword).

- [ ] **Step 4: Commit**

```bash
git add src/features/auth/hooks/index.ts src/features/auth/components/index.ts
git commit -m "feat: export auth hooks and components from barrels"
```
