/**
 * V2 Track Select Component
 * Combined track and course selection
 */

import { h } from 'preact';
import { useState, useEffect, useCallback, useMemo } from 'preact/hooks';
import { CustomSelect } from './components';

// Import course and track data
import courses from '../../uma-skill-tools/data/course_data.json';
import tracknames from '../../uma-skill-tools/data/tracknames.json';
import { Surface } from '../../uma-skill-tools/CourseData';

// Build coursesByTrack mapping
const coursesByTrack: Record<number, number[]> = (() => {
	const o: Record<number, number[]> = {};
	Object.keys(courses).forEach(cid => {
		const tid = (courses as any)[cid].raceTrackId;
		if (tid in o) {
			o[tid].push(+cid);
		} else {
			o[tid] = [+cid];
		}
	});
	return o;
})();

// Inout labels
const inoutLabels: Record<number, string> = {
	0: '',
	1: '',
	2: ' (inner)',
	3: ' (outer)',
	4: ' (outer→inner)',
};

interface V2TrackSelectProps {
	courseid: number;
	setCourseid: (id: number) => void;
}

export function V2TrackSelect({ courseid, setCourseid }: V2TrackSelectProps) {
	const course = (courses as any)[courseid];
	const [trackid, setTrackid] = useState<number>(course?.raceTrackId || 10001);

	// Sync trackid when courseid changes externally (e.g., from preset selection)
	useEffect(() => {
		const newCourse = (courses as any)[courseid];
		if (newCourse && newCourse.raceTrackId !== trackid) {
			setTrackid(newCourse.raceTrackId);
		}
	}, [courseid]);

	// Build track options
	const trackOptions = useMemo(() => {
		return Object.keys(tracknames).map(tid => ({
			value: +tid,
			label: (tracknames as any)[tid][1] // English name at index 1
		}));
	}, []);

	// Build course options for selected track
	const courseOptions = useMemo(() => {
		const trackCourses = coursesByTrack[trackid] || [];
		return trackCourses.map(cid => {
			const c = (courses as any)[cid];
			const surface = c.surface === Surface.Turf ? 'Turf' : 'Dirt';
			const inout = inoutLabels[c.course] || '';
			// Show surface only if track has multiple surface types
			const hasMixedSurfaces = trackCourses.some(
				id => (courses as any)[id].surface !== c.surface
			);
			const label = hasMixedSurfaces
				? `${surface} ${c.distance}m${inout}`
				: `${c.distance}m${inout}`;
			return { value: cid, label };
		});
	}, [trackid]);

	const changeTrack = useCallback((newTrackId: string | number | null) => {
		const tid = +(newTrackId ?? 10001);
		setTrackid(tid);
		// Auto-select first course on new track
		const firstCourse = coursesByTrack[tid]?.[0];
		if (firstCourse) {
			setCourseid(firstCourse);
		}
	}, [setCourseid]);

	const changeCourse = useCallback((newCourseId: string | number | null) => {
		setCourseid(+(newCourseId ?? courseid));
	}, [setCourseid, courseid]);

	return (
		<div class="v2-track-select">
			<CustomSelect
				value={trackid}
				onChange={changeTrack}
				options={trackOptions}
				className="v2-track-select-track"
			/>
			<CustomSelect
				value={courseid}
				onChange={changeCourse}
				options={courseOptions}
				className="v2-track-select-course"
			/>
		</div>
	);
}
