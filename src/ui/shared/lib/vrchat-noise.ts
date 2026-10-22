// Parameters VRChat streams on its own (locomotion, gestures, visemes, state flags). They
// flood a monitor at 10+ Hz and would hijack "learn", so both skip them by default.
const VRCHAT_BUILTIN_PARAMETERS = new Set([
    'AFK',
    'AngularY',
    'AvatarVersion',
    'Earmuffs',
    'EyeHeightAsMeters',
    'EyeHeightAsPercent',
    'GestureLeft',
    'GestureLeftWeight',
    'GestureRight',
    'GestureRightWeight',
    'Grounded',
    'InStation',
    'IsAnimatorEnabled',
    'IsLocal',
    'IsOnFriendsList',
    'MuteSelf',
    'ScaleFactor',
    'ScaleFactorInverse',
    'ScaleModified',
    'Seated',
    'TrackingType',
    'Upright',
    'VRMode',
    'VelocityMagnitude',
    'VelocityX',
    'VelocityY',
    'VelocityZ',
    'Viseme',
    'Voice',
]);

const AVATAR_PARAMETER_PREFIX = '/avatar/parameters/';

export function isVrchatNoise(address: string): boolean {
    if (address.startsWith('/tracking/') || address === '/avatar/change') {
        return true;
    }
    if (!address.startsWith(AVATAR_PARAMETER_PREFIX)) {
        return false;
    }
    const name = address.slice(AVATAR_PARAMETER_PREFIX.length);
    // Avatar Dynamics contacts/physbones stream continuously as well.
    return VRCHAT_BUILTIN_PARAMETERS.has(name) || /_(Angle|Stretch|Squish|IsGrabbed|IsPosed)$/.test(name);
}
